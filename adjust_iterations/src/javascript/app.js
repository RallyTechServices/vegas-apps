Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    items: [
        {xtype:'container',itemId:'display_box', margin: 10},
        {xtype:'container',itemId:'button_box',cls:'tscenter'}
        /*,
        {xtype:'tsinfolink'}
        */
    ],
    launch: function() {
        this.setLoading('Finding Velocities...');
        this.down('#display_box').add({xtype:'container',itemId:'velocity_box',tpl:this._getDisplayTemplate()});
        if (typeof(this.getAppId()) == 'undefined' ) {
            // not inside Rally
            this._showExternalSettingsDialog(this.getSettingsFields());
        } else {
            this._getData();
        }
    },
    _getData: function() {
        var include_current_iteration = this.getSetting('include_current_iteration');

        Deft.Promise.all([this._getPastIterations(include_current_iteration),this._getFutureIterations()]).then({
            scope: this,
            success: function(iterations) {
                this.logger.log("Found iterations",iterations);
                var past_iterations = iterations[0];
                var future_iterations = iterations[1];
                this._getVelocitiesForIterations(past_iterations).then({
                    scope: this,
                    success: function(velocities){
                        this.logger.log("velocities ",velocities);
                        var average = Ext.Array.mean(velocities);
                        this.logger.log("average ", average);
                        this.down('#velocity_box').update({
                            average:average,
                            include_current_iteration:include_current_iteration
                        });
                        this._addButton(average,future_iterations);
                    },
                    failure: function(message){
                        alert(message);
                    }
                });
            }
        });
    },
    _getDisplayTemplate: function() {
        return new Ext.XTemplate(
            '<tpl>',
                '<div class="tsnumber">{average}</div>',
                '<div class="tscenter">',
                '<tpl if="include_current_iteration">',
                    'Includes Current Iteration',
                '<tpl else>',
                    'Does Not Include Current Iteration',
                '</tpl>',
                '</div>',
            '</tpl>'
        );
    },
    _addButton: function(velocity,iterations) {
        this.setLoading(false);
        this.down('#button_box').add({
            xtype:'rallybutton',
            text:'Set Planned Velocity For Future Iterations',
            scope: this,
            handler: function() {
                this._setVelocity(velocity,iterations)
            }
        });
    },
    _getPastIterations: function(include_current_iteration) {
        var deferred = Ext.create('Deft.Deferred');
        this.logger.log("_getPastIterations",include_current_iteration);
        
        var today = new Date();
        var today_iso = Rally.util.DateTime.toIsoString(today);
        var filters = [{property:'EndDate',operator:'<',value:today_iso}];
        if (include_current_iteration) {
            filters = [{property:'StartDate',operator:'<',value:today_iso}];
        }
        Ext.create('Rally.data.wsapi.Store',{
            model: 'Iteration',
            autoLoad: true,
            limit: 5,
            pageSize: 5,
            filters: filters,
            sorters: [{property:'EndDate',direction:'DESC'}],
            context: {
                projectScopeDown: false,
                projectScopeUp: false
            },
            listeners: {
                scope: this,
                load: function(store,iterations){
                    deferred.resolve(iterations);
                }
            }
        });
        return deferred;
    },
    _getFutureIterations: function() {
        var deferred = Ext.create('Deft.Deferred');
        var today = new Date();
        var today_iso = Rally.util.DateTime.toIsoString(today);
        Ext.create('Rally.data.wsapi.Store',{
            model: 'Iteration',
            autoLoad: true,
            filters: [{property:'StartDate',operator:'>',value:today_iso}],
            sorters: [{property:'StartDate',direction:'ASC'}],
            context: {
                projectScopeDown: false,
                projectScopeUp: false
            },
            listeners: {
                scope: this,
                load: function(store,iterations){
                    deferred.resolve(iterations);
                }
            }
        });
        return deferred;
    },
    _getVelocitiesForIterations: function(past_iterations){
        var me = this;
        var promises = [];
        this.logger.log("_getVelocitiesForIterations");
        Ext.Array.each(past_iterations,function(past_iteration){
            promises.push(me._getVelocityForIteration(past_iteration));
        },this);
        return Deft.Promise.all(promises);
    },
    _getVelocityForIteration: function(iteration) {
        var deferred = Ext.create('Deft.Deferred');
        var velocity = 0;
        var filters = [
            { property:'Iteration.ObjectID',value: iteration.get('ObjectID') },
            { property:'ScheduleState',operator: '>',value:'Completed' }
        ];
        Ext.create('Rally.data.wsapi.Store',{
            model: 'UserStory',
            autoLoad: true,
            filters: filters,
            listeners: {
                scope: this,
                load: function(store,stories){
                    this.logger.log("  ", iteration.get('Name'),'# accepted stories', stories.length);
                    Ext.create('Rally.data.wsapi.Store',{
                        model:'Defect',
                        autoLoad:true,
                        filters:filters,
                        listeners: {
                            scope: this,
                            load: function(store,defects){
                                this.logger.log("  ",iteration.get('Name'),'# accepted defects', defects.length);
                                var items = Ext.Array.push(defects,stories);
                                Ext.Array.each(items,function(item){
                                    var estimate = item.get('PlanEstimate') || 0;
                                    velocity += estimate;
                                });
                                this.logger.log("Velocity for " + iteration.get('Name') + " is:",velocity);
                                deferred.resolve(velocity);
                            }
                        }
                    });
                }
            }
        });
        return deferred;
    },
    _setVelocity: function(velocity,iterations) {
        this.setLoading("Setting Velocity...");
        var promises = [];
        Ext.Array.each(iterations,function(iteration){
            promises.push(this._setVelocityForIteration(velocity,iteration));
        },this);
        Deft.Promise.all(promises).then({
            scope: this,
            success: function(response){
                this.setLoading(false);
            },
            failure: function(message){
                alert(message);
                this.setLoading(false);
            }
        });
    },
    _setVelocityForIteration: function(velocity,iteration){
        var deferred = Ext.create('Deft.Deferred');
        iteration.set('PlannedVelocity',velocity);
        iteration.save({
            callback: function(result, operation) {
                if(operation.wasSuccessful()) {
                    deferred.resolve(result);
                } else {
                    deferred.reject("Problem saving");
                }
            }
        });
        return deferred;
    },
    getSettingsFields: function() {
        return [
            {
                name: 'include_current_iteration',
                xtype: 'rallycheckboxfield',
                fieldLabel: 'Include Current Iteration in Calculation',
                width: 300,
                labelWidth: 200/*,
                readyEvent: 'added'*/ //event fired to signify readiness
            }
        ];
    },
    // ONLY FOR RUNNING EXTERNALLY
    _showExternalSettingsDialog: function(fields){
        var me = this;
        if ( this.settings_dialog ) { this.settings_dialog.destroy(); }
        this.settings_dialog = Ext.create('Rally.ui.dialog.Dialog', {
             autoShow: false,
             draggable: true,
             width: 400,
             title: 'Settings',
             buttons: [{ 
                text: 'OK',
                handler: function(cmp){
                    var settings = {};
                    Ext.Array.each(fields,function(field){
                        settings[field.name] = cmp.up('rallydialog').down('[name="' + field.name + '"]').getValue();
                    });
                    me.settings = settings;
                    cmp.up('rallydialog').destroy();
                    me._getData();
                }
            }],
             items: [
                {xtype:'container',html: "&nbsp;", padding: 5, margin: 5},
                {xtype:'container',itemId:'field_box', padding: 5, margin: 5}]
         });
         Ext.Array.each(fields,function(field){
            me.settings_dialog.down('#field_box').add(field);
         });
         this.settings_dialog.show();
    },
    resizeIframe: function() {
        var iframeContentHeight = 800;    
        var container = window.frameElement.parentElement;
        if (container != parent.document.body) {
            container.style.height = iframeContentHeight + 'px';
        }
        window.frameElement.style.height = iframeContentHeight + 'px';
        return;
    }
});
