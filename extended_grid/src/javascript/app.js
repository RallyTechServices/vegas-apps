Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    column_widths: {},
    requires: [
        'Rally.data.util.Sorter',
        'Rally.data.wsapi.Filter',
        'Rally.ui.grid.Grid',
        'Rally.data.ModelFactory',
        'Rally.ui.grid.plugin.PercentDonePopoverPlugin'
    ],
    config: {
        defaultSettings: {
            type_path: 'PortfolioItem/Feature',
            fetch: 'FormattedID,Name'
        }
    },
    padding: 10,
    items: [
        {xtype:'container',itemId:'display_box',autoScroll: false},
        {xtype:'tsinfolink'}
    ],
    autoScroll: true,
    launch: function() {
        if (this.isExternal()){
            this.showSettings(this.config);
        } else {
            if ( ! this.getSetting('type_path') ) {
                this.down('#display_box').add({
                    xtype:'container',
                    html:'No settings applied.  Select "Edit App Settings." from the gear menu.'
                });
            }
            this.onSettingsUpdate(this.getSettings());  //(this.config.type,this.config.pageSize,this.config.fetch,this.config.columns);
        }  
    },
    _addGrid: function() {
        var context = this.getContext(),
            pageSize = this.getSetting('pageSize'),
            fetch = this.getSetting('fetch'),
            order = this.getSetting('order'),
            columns = this._getColumns(fetch);
        
        // fields that are necessary for the column calculation
        var necessary_fields = ['ActualStartDate','PercentDoneByStoryCount','PercentDoneByStoryPlanEstimate'];
        var full_fetch = Ext.Array.merge(this._getFetchArray(fetch),necessary_fields);
        
        var calculated_columns = this._getCalculatedColumns();
        var full_columns = this._putColumnsInOrder(Ext.Array.merge(columns,calculated_columns));
        
        this.logger.log("Using columns:",full_columns);
        
        var type_path = this.getSetting('type_path');
            
        this.down('#display_box').add({
            xtype: 'rallygrid',
            columnCfgs: full_columns,
            enableColumnHide: false,
            enableRanking: true,
            autoScroll: false,
            scroll: false,
            enableBulkEdit: context.isFeatureEnabled("BETA_TRACKING_EXPERIENCE"),
            plugins: this._getPlugins(columns),
            context: this.getContext(),
            listeners: {
                scope: this,
                columnresize: this._saveColumnResize,
                columnmove: this._saveColumnMove
                
            },
            storeConfig: {
                fetch: full_fetch,
                models: type_path,
                filters: this._getFilters(),
                pageSize: pageSize,
                sorters: Rally.data.util.Sorter.sorters(this.getSetting('order'))
            },
            pagingToolbarCfg: {
                pageSizes: [pageSize]
            }
        });
    },

    onTimeboxScopeChange: function(newTimeboxScope) {
        this.callParent(arguments);

        this.down('rallygrid').filter(this._getFilters(), true, true);
    },

    _getFilters: function() {
        var filters = [],
            query = this.getSetting('query'),
            timeboxScope = this.getContext().getTimeboxScope();
        if(query) {
            try {
                query = new Ext.Template(query).apply({
                    user: Rally.util.Ref.getRelativeUri(this.getContext().getUser())
                });
            } catch(e) {}
            var filterObj = Rally.data.wsapi.Filter.fromQueryString(query);
            filterObj.itemId = filterObj.toString();
            filters.push(filterObj);
        }

        if(timeboxScope && _.every(this.getSetting('types').split(','), this._isSchedulableType, this)) {
            var timeboxFilterObj = timeboxScope.getQueryFilter();
            timeboxFilterObj.itemId = timeboxFilterObj.toString();
            filters.push(timeboxFilterObj);
        }
        return filters;
    },

    _isSchedulableType: function(type) {
        return _.contains(['hierarchicalrequirement', 'task', 'defect', 'defectsuite', 'testset'], type.toLowerCase());
    },

    _getFetchOnlyFields:function(){
        return ['LatestDiscussionAgeInMinutes'];
    },

    _getFetchArray: function(fetch){
        var fetch_array = fetch;
        if ( Ext.isString(fetch) ) {
            fetch_array = fetch.split(',');
        }
        return fetch_array;
    },
    
    _getColumns: function(fetch){
        var columns = [];
        if (fetch) {
            var fetch_array = this._getFetchArray(fetch);
            Ext.Array.each ( Ext.Array.difference(fetch_array, this._getFetchOnlyFields()), function(fetch_item) {
                columns.push(this._makeColumnFromName(fetch_item));
            },this);
        }
        
        return columns;
    },
    _putColumnsInOrder: function(columns) {
        this.logger.log("_putColumnsInOrder",columns);
        var column_order =  [];
        var ordered_column_data_indexes = [];
        var ordered_columns = [];
        /*
         * column_order is an array of the data indexes of columns in order (left-to-right) from saved settings
         * ordered_columns = an array of column definitions in order based on column_order
         * ordered_column_data_indexes is an array of column names that have been put into the ordered array
         */
        if (this.getSetting("column_order")) {
            column_order = this.getSetting("column_order").split(',');
            // loop over the order of column indexes
            Ext.Array.each(column_order,function(data_index){
                // loop over the columns to find if there's one that matches the current one
                Ext.Array.each(columns,function(column_definition){
                    if (column_definition.dataIndex == data_index){
                        ordered_columns.push(column_definition);
                        ordered_column_data_indexes.push(data_index);
                    }
                },this);
            },this);
        }
        /*
         * After the columns that we know the order of, make sure we put any other column definitions
         * that we know about onto the end of the ordered_columns array
         */
        Ext.Array.each(columns,function(column_definition){
            if ( !Ext.Array.contains(ordered_column_data_indexes,column_definition.dataIndex)) {
                ordered_columns.push(column_definition);
            }
        });
        return ordered_columns;
    },
    _makeColumnFromName:function(field_name){
        var column = {
            dataIndex:field_name,
            menuDisabled: true
        };
        if (this.getSetting(column.dataIndex+"_colwidth")) {
            column.width =  this.getSetting(column.dataIndex+"_colwidth");
        }
        return column;
    },
    _getCalculatedColumns:function() {
        var columns = [];
        var me = this;
        var today = new Date();
        
/*        columns.push({
            text:"Projection (count)",
            dataIndex:'ObjectID',
            menuDisabled: true,
            renderer:function(value,meta_data,record){
                var actual_start = record.get('ActualStartDate');
                var percent_done = record.get('PercentDoneByStoryCount');
                if ( percent_done === 1 ) {
                    return "Done";
                }
                
                if ( percent_done === 0 ) {
                    return "Not Started";
                }
                
                var days_behind = Rally.util.DateTime.getDifference(today,actual_start, 'day');
                var days_ahead = ( 1 - percent_done ) * days_behind / percent_done;
                
                var predicted_date = Rally.util.DateTime.add(today,"day",days_ahead);
                return Rally.util.DateTime.formatWithDefaultDateTime(predicted_date).replace(/ .*$/,"");
            }
        });
*/        
        var column = {
            text:"Projected Golden Game",
            dataIndex:'DisplayColor',
            menuDisabled: true,
            renderer:function(value,meta_data,record){
                var actual_start = record.get('ActualStartDate');
                var percent_done = record.get('PercentDoneByStoryPlanEstimate');
                if ( percent_done === 1 ) {
                    return "Done";
                }
                
                if ( percent_done === 0 ) {
                    return "Not Started";
                }
                
                var days_behind = Rally.util.DateTime.getDifference(today,actual_start, 'day');
                var days_ahead = ( 1 - percent_done ) * days_behind / percent_done;
                
                var predicted_date = Rally.util.DateTime.add(today,"day",days_ahead);
                return Rally.util.DateTime.formatWithDefaultDateTime(predicted_date).replace(/ .*$/,"");
            }
        }
        if (this.getSetting(column.dataIndex+"_colwidth")) {
            column.width =  this.getSetting(column.dataIndex+"_colwidth");
        }
        columns.push(column);
        return columns;
    },

    _saveColumnResize: function(grid,column,width) {
        if (column.dataIndex ) {
            this.column_widths[column.dataIndex+"_colwidth"] = width;
        }
        
        this.updateSettingsValues({
            settings: this.column_widths
        });
        
    },
    _saveColumnMove: function(header,column,fromIdx, toIdx) {
        this.logger.log(header.getGridColumns());
        var ordered_column_data_indexes = [];
        Ext.Array.each(header.getGridColumns(),function(column){
            this.logger.log("Column:", column.dataIndex);
            if ( column.dataIndex ) {
                ordered_column_data_indexes.push(column.dataIndex);
            }
        }, this);
        this.updateSettingsValues({
            settings: { column_order: ordered_column_data_indexes }
        });
        
    },
    _getPlugins: function(columns) {
        var plugins = [];

        if (Ext.Array.intersect(columns, ['PercentDoneByStoryPlanEstimate','PercentDoneByStoryCount']).length > 0) {
            plugins.push('rallypercentdonepopoverplugin');
        }

        return plugins;
    },
    _loadAStoreWithAPromise: function(model_name, model_fields){
        var deferred = Ext.create('Deft.Deferred');
        
        var defectStore = Ext.create('Rally.data.wsapi.Store', {
            model: model_name,
            fetch: model_fields,
            autoLoad: true,
            listeners: {
                load: function(store, records, successful) {
                    if (successful){
                        deferred.resolve(store);
                    } else {
                        deferred.reject('Failed to load store for model [' + model_name + '] and fields [' + model_fields.join(',') + ']');
                    }
                }
            }
        });
        return deferred.promise;
    },
    /********************************************
    /* Overrides for App class
    /*
    /********************************************/
    //getSettingsFields:  Override for App    
    getSettingsFields: function() {
        var me = this;
        
        var label_width = 65;
        var field_width = 250;
        return [
        {
            name: 'type_path',
            xtype:'rallycombobox',
            displayField: 'DisplayName',
            fieldLabel: 'Object',
            autoExpand: true,
            storeConfig: {
                model:'TypeDefinition',
                filters: [
                    {property:'Restorable',value:true},
                    {property:'Creatable',value:true},
                    {property:'TypePath',operator:'contains',value:'Portfolio'}
                ]
            },
            labelWidth: label_width,
            labelAlign: 'left',
            width: field_width,
            margin: 10,
            valueField:'TypePath',
            readyEvent: 'ready'
        },
        {
            name: 'fetch',
            xtype: 'rallyfieldpicker',
            fieldLabel: 'Columns',
            labelWidth: label_width,
            labelAlign: 'left',
            width: field_width,
            margin: 10,
            alwaysExpanded: false,
            autoExpand: true,
            modelTypes:['PortfolioItem'],
            readyEvent: 'expand'
        },
        { 
            xtype:'container',
            height: 248
        },
        {
            name:'query',
            xtype:'textareafield',
            fieldLabel:'Query',
            grow: true,
            width: field_width,
            labelWidth: label_width,
            margin: 10
        },
        {
            name:'order',
            xtype:'rallytextfield',
            fieldLabel:'Order',
            width: field_width,
            labelWidth: label_width,
            margin: 10
        },
        {
            name:'pageSize',
            xtype:'rallynumberfield',
            fieldLabel:'Page Size',
            width: field_width,
            labelWidth: label_width,
            margin: 10,
            maxValue: 200,
            minValue: 1
        }];
    },
    //showSettings:  Override to add showing when external + scrolling
    showSettings: function(options) {
        this.logger.log("showSettings",options);
        this._appSettings = Ext.create('Rally.app.AppSettings', Ext.apply({
            fields: this.getSettingsFields(),
            settings: this.getSettings(),
            defaultSettings: this.getDefaultSettings(),
            context: this.getContext(),
            settingsScope: this.settingsScope
        }, options));

        this._appSettings.on('cancel', this._hideSettings, this);
        this._appSettings.on('save', this._onSettingsSaved, this);
        
        if (this.isExternal()){
            if (this.down('#display_box').getComponent(this._appSettings.id)==undefined){
                this.down('#display_box').add(this._appSettings);
            }
        } else {
            this.hide();
            this.up().add(this._appSettings);
        }
        return this._appSettings;
    },
    _onSettingsSaved: function(settings){
        this.logger.log('_onSettingsSaved',settings);
        Ext.apply(this.settings, settings);
        this._hideSettings();
        this.onSettingsUpdate(settings);
    },
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        //Build and save column settings...this means that we need to get the display names and multi-list
        this.logger.log('onSettingsUpdate',settings);
        
        this._addGrid();
    },
    isExternal: function(){
      return typeof(this.getAppId()) == 'undefined';
    }
});