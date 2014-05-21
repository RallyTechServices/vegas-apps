Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    items: [
        {xtype:'container',itemId:'selector_box',margin: 10 },
        {xtype:'container',itemId:'chart_box', margin: 10 }
    ],
    launch: function() {
        console.log("Launching");
        //this.setLoading(true);

        var projectRef = this.getContext().getProjectRef();
        var projectOid = this.getContext().getProject().ObjectID;

        this.down('#selector_box').add({
            xtype:'rallyreleasecombobox',
            allowNoEntry: true,
            padding: 5,
            fieldLabel: "Release:",
            labelWidth: 50,
            noEntryText: "-- All --",
            listeners: {
                scope: this,
                change: function(release_box, new_value, old_value, eOpts ) {
                    console.log("Change Release", new_value);
                    
                    console.log(" Release: ", release_box.getRecord());
                    this.down('#chart_box').removeAll();
                    this.gatherData(projectRef,projectOid,release_box.getRecord());
                }
            }
        });
    },
    gatherData: function(projectRef,projectOid,release) {
        this.loadIterations(projectRef, projectOid,release).then({
            scope: this,
            success: function(iterations) {
                console.log("back from iterations",iterations);
                var iterationFilters = this.getIterationFilters(iterations);

                this.loadCapacities(projectRef, projectOid, iterationFilters).then({
                    scope: this,
                    success: function(capacities) {
                        console.log("back from capacities",capacities);
                        this.setLoading(false);
                        this.loadChart(iterations, capacities, projectOid, release);
                    },
                    failure: function(error) {
                        console.log("Failed to load iteration capacities");
                        console.log(error);
                    }
                });
            },
            failure: function(error) {
                console.log("Failed to load iterations for project '" + projectRef + "'");
                console.log(error);
            }
        });
    },
    getIterationFilters: function(iterations) {
        console.log("getIterationFilters",iterations);
        var iterationFilters = [];
        for (var i = 0, l = iterations.length; i < l; i++) {
            iterationFilters.push({
                property: 'Iteration',
                value: iterations[i].get('_ref')
            });
        }
        return iterationFilters;
    },

    loadIterations: function(projectRef, projectOid, release) {
        var deferred = Ext.create('Deft.Deferred');
        console.log("loadIterations",projectRef,projectOid,release);
        
        var filters = [{ property: 'Project', value: projectRef }];
        
        var release_oid = release.get('ObjectID');
        if ( release_oid > 0 ) {
            var start_date = Rally.util.DateTime.toIsoString(release.get('ReleaseStartDate'));
            var end_date = Rally.util.DateTime.toIsoString(release.get('ReleaseDate'));
            
            filters.push( { property:'EndDate', operator: '<=', value: end_date });
            filters.push( { property:'StartDate', operator: '>=',value: start_date });
        }
        Ext.create('Rally.data.wsapi.Store', {
            model: 'Iteration',
            autoLoad: true,
            context: {
                project: projectRef,
                projectScopeUp: false,
                projectScopeDown: false
            },
            filters: filters,
            sorters: [
                {
                    property: 'EndDate',
                    direction: 'ASC'
                }
            ],
            listeners: {
                load: function(store,records,successful){
                    console.log("returned with ", records, successful);
                    if ( successful ) {
                        deferred.resolve(records);
                    } else {
                        deferred.reject("Cannot load iterations");
                    }
                }
            }
        });
        return deferred;
    },
    loadCapacities: function(projectRef, projectOid, iterationFilters) {
        var deferred = Ext.create('Deft.Deferred');
        console.log('loadCapacities',projectRef,projectOid);
        
        Ext.create('Rally.data.wsapi.Store', {
            model: 'useriterationcapacity',
            autoLoad: true,
            context: {
                project: projectRef,
                projectScopeUp: false,
                projectScopeDown: false
            },
            filters: Rally.data.QueryFilter.or(iterationFilters),
            fetch: ['Capacity', 'Iteration'],
            listeners: {
                load: function(store,records,successful){
                    if ( successful ) {
                        deferred.resolve(records);
                    } else {
                        deffered.reject("Cannot load capacities");
                    }
                }
            }
        });

        return deferred;
    },

    loadChart: function(iterations, capacities, projectOid, release) {
        console.log("loadChart",iterations,capacities,projectOid,release);
        
        var filters = {
            '_ProjectHierarchy': projectOid,
            '_TypeHierarchy': 'HierarchicalRequirement',
            'Children': null
        };
        if ( release.get('ObjectID') > 0 ) {
            filters.Release = release.get('ObjectID');
        }
        var chart = {
            xtype: 'rallychart',

            storeType: 'Rally.data.lookback.SnapshotStore',
            storeConfig: {
                find: filters,
                fetch: ['PlanEstimate', 'ObjectID', 'ScheduleState', '_ValidFrom', '_ValidTo', '_PreviousValues'],
                hydrate: ['ScheduleState'],
                sort: { '_ValidFrom': -1 }
            },

            calculatorType: 'ActualCalculator',
            calculatorConfig: {
                iterations: iterations,
                capacities: capacities,
                release: release
            },

            chartColors: ['#006b2f', '#009944', '#A40000', '#254361', '#8E8E8E', '#ee00000'],

            chartConfig: {
                chart: {
                    type: 'column',
                    zoomType: 'xy'
                },
                title: {
                    text: 'Project Burn Chart by Iteration'
                },
                xAxis: {
                    // needed to keep it from blowing up
                    labels: {
                        rotation: -75,
                        align: 'right',
                        style: {
                            fontSize: '13px',
                            fontFamily: 'Verdana, sans-serif'
                        }
                    }
                },
                yAxis: {
                    lineWidth: 1,
                    tickInterval: 50,
                    min: 0,
                    title: {
                        text: 'Story Points'
                    }
                },
                plotOptions: {
                    column: {
                        stacking: 'normal',
                        borderWidth: 0,
                        shadow: true
                    },
                    line: {
                        connectNulls: false,
                        lineWidth: 1,
                        marker: {
                            radius: 2.5
                        }
                    }
                },
                tooltip: {
                    shared: true
                }
            }
        };
        
        this.down('#chart_box').removeAll();
        this.down('#chart_box').add(chart);
    }
});
