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
            listeners: {
                scope: this,
                change: function(box,new_value) {
                    this.logger.log("change",box.getRecord());
                    var user_oid = box.getRecord().get('ObjectID');
                    if ( user_oid ) {
                        this._getStoriesForOwner(user_oid).then({
                            scope: this,
                            success: this._makeGrid,
                            failure: this._showError
                        });
                    }
                }
            }
        });
    },
    _getStoriesForOwner: function(user_oid) {
        this.logger.log("_getStoriesForOwner",user_oid);
        var deferred = Ext.create('Deft.Deferred');
        this.setLoading("Getting Stories...");
        
        Ext.create('Rally.data.wsapi.Store',{
            model: 'User Story',
            autoLoad: true,
            listeners: {
                scope: this,
                load: function(store,records){
                    deferred.resolve(store);
                }
            }
        });
        return deferred;
    },
    _showError: function(message) {
        alert(message);
    },
    _makeGrid: function(work_item_store) {
        this.logger.log("_makeGrid",work_item_store);
        
        this.down('#display_box').add({
            xtype:'rallygrid',
            store:work_item_store,
            showRowActionsColumn:false,
            enableColumnMove:false,
            pagingToolbarCfg: {
                store:work_item_store
            },
            columnCfgs: [
                {dataIndex:'FormattedID',text:'id',flex: 1},
                {dataIndex:'Name',text:'Name'},
                {dataIndex:'Project',text:'Project'}
            ]
        });
        this.setLoading(false);
    }
});
