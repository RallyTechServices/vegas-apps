Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    items: [
        {xtype:'container',itemId:'selector_box', margin: 5},
        {xtype:'container',itemId:'display_box', margin: 5} 
        /*,
        {xtype:'tsinfolink'}
        */
    ],
    launch: function() {
        this.down('#selector_box').add({
            xtype:'rallyusersearchcombobox',
            project: this.getContext().getProject(),
            fieldLabel: 'Owner:',
            labelWidth: 45,
            emptyText: "Type a letter...",
            allowNoEntry: false,
            listeners: {
                scope: this,
                change: function(box,new_value) {
                    this.logger.log("change",box.getRecord());
                    var user_oid = box.getRecord().get('ObjectID');
                    if ( user_oid ) {
                        this._makeGrid(user_oid);
                    }
                }
            }
        });
    },
    _addCalculatedFieldsToRecords: function(records){
        var me = this;
        Ext.Array.each(records,function(record){
            me.logger.log("Iteration:",record.get('Iteration'));
            var empty_iteration = {Name:'Unscheduled',StartDate:'',EndDate:''};
            
            
            var iteration = record.get('Iteration') || empty_iteration;
            record.set('__iteration_start',iteration.StartDate);
            record.set('__iteration_end',  iteration.EndDate);
        });
    },
    _showError: function(message) {
        alert(message);
    },
    _makeGrid: function(user_oid) {
        this.logger.log("_makeGrid",user_oid);
        this.down('#display_box').removeAll();
        
        var end_renderer = function(value,meta_data) {
            if ( !typeof(value) == "object" || value === null ) {
                return value;
            }
            var display_value = value.ReleaseDate || value.EndDate;
            if ( typeof(display_value) == 'undefined' ) {
                return "";
            }
            return display_value.replace(/T.*$/,"");
        };
        
        var start_renderer = function(value,meta_data) {
            if ( !typeof(value) == "object" || value === null ) {
                return value;
            }
            var display_value = value.ReleaseStartDate || value.StartDate;
            if ( typeof(display_value) == 'undefined' ) {
                return "";
            }
            return display_value.replace(/T.*$/,"");
        };
        
        var grid = this.down('#display_box').add({
            xtype:'rallygrid',
            storeConfig: {
                model:'User Story',
                fetch: ['FormattedID','Name','Project','Iteration','StartDate','EndDate','ReleaseStartDate','ReleaseDate'],
                filters: [{property:'Owner.ObjectID',value:user_oid}]
            },
            showRowActionsColumn:false,
            enableColumnMove:false,
            columnCfgs: [
                {dataIndex:'FormattedID',text:'id',flex: 1},
                {dataIndex:'Name',text:'Name'},
                {dataIndex:'Project',text:'Project'},
                {dataIndex:'Release',text:'Release', getSortParameter: function() {
                    return 'Release.ReleaseDate';
                }},
                {dataIndex:'Release', text:'Release Start', renderer: start_renderer, sortable: false },
                {dataIndex:'Release', text:'Release End', renderer: end_renderer, sortable: false },
                {dataIndex:'Iteration',text:'Iteration', getSortParameter: function() {
                    return 'Iteration.EndDate';
                }},
                {dataIndex:'Iteration', text:'Iteration Start', renderer: start_renderer, sortable: false },
                {dataIndex:'Iteration', text:'Iteration End', renderer: end_renderer, sortable: false }
            ]
        });
        // have to do the sort after the grid is ready so that we can use the column's sorter,
        // because the store doesn't understand the Release fields
        
        grid.on('load',function() { 
                var columns = grid.query('gridcolumn');
                columns[3].doSort('ASC');
            }, this, { single: true });
    }
});
