Ext.define('ActualCalculator', {
    extend: 'Rally.data.lookback.calculator.BaseCalculator',
    logger: new Rally.technicalservices.Logger(),

    /**
     * releases
     * 
     * [{@model}] An array of release model instances to restrict data to 
     *            (do not put in the filters).  Empty array is ignore release.
     */
    releases: [],
    /**
     * items_in_release
     * 
     * [{@model}] An array of items in the release so that we can make sure to 
     * ignore things that don't exist any more
     * 
     */
    items_in_release: [],
    runCalculation: function(snapshots) {        
        var release_oids = [];
        Ext.Array.each(this.releases,function(release){
            release_oids.push(release.get('ObjectID'));
        });
        
        var undeleted_items = [];
        Ext.Array.each(this.items_in_release,function(item_in_release){
            undeleted_items.push(item_in_release.get('ObjectID'));
        });
        
        var completedIterationTotals = {};
        var completedStoryIterations = {};

        var incompleteIterationTotals = {};
        var oldTotal, iteration, iterationName;
        
        var wsapi_actualSeriesData = this.getActualSeriesDataFromWsapi();
        var wsapi_cumulativeActualSeriesData = this.getCumulativeActualSeriesDataFromWsapi(wsapi_actualSeriesData);
        
        for (var s = 0, l = snapshots.length; s < l; s++) {
            var snapshot = snapshots[s];
//
// no longer care if the item was in the release at the time of the snapshot (only care about now)
//            if ( this.snapshotIsAssociatedWithRelease(snapshot,release_oids) && 
//                this.snapshotIsAssociatedWithUndeletedItem(snapshot,undeleted_items) ){
            if ( this.snapshotIsAssociatedWithUndeletedItem(snapshot,undeleted_items) ){
                
                var objectID = snapshot.ObjectID;
                var iterations = this.getMatchingIterations(snapshot);
                if (iterations.length === 0) {
                    continue;
                }
    
                if (snapshot.ScheduleState === "Accepted") {
                    iteration = iterations[0];
                    iterationName = iteration.get('Name');
                    if (snapshot._PreviousValues && (typeof snapshot._PreviousValues.ScheduleState) !== 'undefined' && !completedStoryIterations[objectID]) {
                        completedStoryIterations[objectID] = iteration;
                        oldTotal = completedIterationTotals[iterationName] || 0;
                        completedIterationTotals[iterationName] = oldTotal + snapshot.PlanEstimate;
                    }
                } else {
                    for (var iter = 0, iterL = iterations.length; iter < iterL; iter++) {
                        iteration = iterations[iter];
                        iterationName = iteration.get('Name');
                        oldTotal = incompleteIterationTotals[iterationName] || 0;
                        incompleteIterationTotals[iterationName] = oldTotal + snapshot.PlanEstimate;
                    }
                }
            }
        } /* end of for loop */

        var actualSeriesData = [];
        var cumulativeActuals = 0;
        var cumulativeActualSeriesData = [];
        var backlogRemainingSeriesData = [];
        var devIncreaseSeriesData = [];
        var devIncrease = 0;
        var cumulativedevIncrease = 0;
        var previousBacklogRemaining = null;
        var categories = [];
        var TotalPoints = 0;
        var ReleaseIteration = 0;
        var pastIteration = true;
        var today = new Date().getTime();
        ReleaseIteration = this.iterations.length -1 || 0;
        for (var i = 0, il = this.iterations.length; i < il; i++) {
            iteration = this.iterations[i];
            //var iterationStart = iteration.get('StartDate').getTime();
            var iterationEnd = iteration.get('EndDate').getTime();
            pastIteration = iterationEnd <= today;
           // if (iterationEnd <= rel

            iterationName = iteration.get('Name');
            var completedIterationTotal = completedIterationTotals[iterationName] || 0;
            actualSeriesData.push(completedIterationTotal);


            if (pastIteration) {
                cumulativeActualSeriesData.push(cumulativeActuals);
            }
            cumulativeActuals += completedIterationTotal;

            var backlogRemaining = incompleteIterationTotals[iterationName] || 0;

            if (i === 0) {
                TotalPoints = backlogRemaining;
                devIncreaseSeriesData.push(0);
            } else {
                devIncrease = Math.max(backlogRemaining - previousBacklogRemaining + completedIterationTotal, 0);
                cumulativedevIncrease += devIncrease;
                devIncreaseSeriesData.push(devIncrease);
                TotalPoints += devIncrease;
            }
            previousBacklogRemaining = backlogRemaining;
            if (pastIteration) {
//                backlogRemainingSeriesData.push(backlogRemaining - Math.max(backlogRemaining - previousBacklogRemaining + completedIterationTotal, 0));
                backlogRemainingSeriesData.push(backlogRemaining - devIncrease - Math.max(backlogRemaining - previousBacklogRemaining + completedIterationTotal, 0));
            }


            var endLabel = Rally.util.DateTime.formatWithDefault(iteration.get('EndDate'));
            var str = iteration.get('Name');
            var iterationLabel = str.replace("Iteration", "") + '-' + endLabel;
            categories.push(iterationLabel);
        }

        var backlogBurnProjectionSeriesData = this.calculateBacklogBurnProjection(backlogRemainingSeriesData, actualSeriesData, categories);

        this.logger.log("actualSeriesData",actualSeriesData);
        this.logger.log("wsapi_actualSeriesData",wsapi_actualSeriesData);
        this.logger.log("wsapi_cumulativeActualSeriesData",wsapi_cumulativeActualSeriesData);
        return {
            series: [
//                {
//                    name: 'Work Done (Current iteration Accepted Points)',
//                    data: actualSeriesData,
//                    itemId: 'done'
//                },
//                {
//                    name: 'Total Work (Cumulative Accepted Points)',
//                    data: cumulativeActualSeriesData,
//                    itemId: 'total'
//                },
                {
                    name: 'Work Done (Current iteration Accepted Points)',
                    data: wsapi_actualSeriesData,
                    itemId: 'done'
                },
                {
                    // previously accepted points
                    name: 'Total Work (Cumulative Accepted Points)',
                    data: wsapi_cumulativeActualSeriesData,
                    itemId: 'total'
                },
                {
                    name: 'Work Increase (Points per iteration)',
                    data: devIncreaseSeriesData,
                    stack: '1',
                    itemId: 'increase'
                },
                {
                    name: 'Backlog Remaining (Total Unaccepted Points)',
                    data: backlogRemainingSeriesData,
                    stack: '1',
                    itemId: 'remaining'
                },

                {
                    name: 'Burn down projection',
                    data: backlogBurnProjectionSeriesData,
                    itemId: 'projection'
                },
                {
                    name: 'Ideal Line',
                    data: [[0, TotalPoints], [ReleaseIteration, 0]],
                    type: 'line',
                    itemId: 'ideal'

                }
            ],
            categories: categories
        };
    },
    snapshotIsAssociatedWithUndeletedItem: function(snapshot,undeleted_items){
        if ( undeleted_items.length === 0 ) {
            return true;
        }
        if ( typeof(snapshot) == "undefined" ) {
            return false;
        }
        if (Ext.Array.indexOf(undeleted_items,snapshot.ObjectID) > -1){
            return true;
        }
        return false;
    },
    snapshotIsAssociatedWithRelease: function(snapshot,release_oids) {
        if ( release_oids.length === 0 ) {
            return true;
        }
        if ( typeof(snapshot) == "undefined" ) {
            return false;
        }
        if (Ext.Array.indexOf(release_oids,snapshot.Release) > -1){
            return true;
        }
        if ( snapshot._PreviousValues ) {
            if (Ext.Array.indexOf(release_oids,snapshot._PreviousValues.Release) > -1){
                return true;
            }
        }
        return false;
    },
    
    // old way, instead of backlog burn projection
    calculateCapacityBurn: function() {
        var iterationRef;
        var iterationCapacities = {};
        for (var c = 0, l = this.capacities.length; c < l; c++) {
            var capacity = this.capacities[c];
            iterationRef = capacity.get('Iteration')._ref;
            var oldTotal = iterationCapacities[iterationRef] || 0;
            iterationCapacities[iterationRef] = oldTotal + capacity.get('Capacity');
        }

        var data = [0];
        var remainingCapacity = 0;

        for (var i = this.iterations.length - 1; i > 0; i--) {
            var iteration = this.iterations[i];
            iterationRef = iteration.get('_ref');
            var iterationCapacity = iterationCapacities[iterationRef] || 0;
            remainingCapacity += iterationCapacity;
            data.unshift(remainingCapacity);
        }

        return data;
    },

    calculateBacklogBurnProjection: function(backlogRemainingSeriesData, actualSeriesData, categories) {
        var twoWeeksInMillis = 2 * 7 * 24 * 60 * 60 * 1000;
        var backlogRemaining = null;
        var data = [];
        var last3AverageActuals;
        var lastIterationModel = this.iterations[this.iterations.length - 1];
        var lastIteration = {
            endDate: lastIterationModel.get('EndDate')
        };

        // debugger;
        var today = new Date().getTime();
        var lastRealIterationIndex = null;
        for (var i = 0, l = this.iterations.length; i < l; i++) {
            var iteration = this.iterations[i];
            var iterationBeforeToday = (iteration.get('EndDate').getTime() <= today);

            if (!iterationBeforeToday || i === l - 1) {
                last3AverageActuals = 0;
                var actualCount = 0;
                for (var j = lastRealIterationIndex - 4; j <= lastRealIterationIndex; j++) {
                    if (j < 0) {
                        continue;
                    }
                    last3AverageActuals += actualSeriesData[j];
                    actualCount++;
                }
                last3AverageActuals /= actualCount;
            }

            if (iterationBeforeToday) {
                backlogRemaining = backlogRemainingSeriesData[i];
                lastRealIterationIndex = i;
            }
            else {
                backlogRemaining -= last3AverageActuals;
            }

            if (backlogRemaining <= 0 || iterationBeforeToday) {
                data.push(null);
            }
            else {
                data.push(backlogRemaining);
            }
        }

        while (backlogRemaining > 0 && last3AverageActuals > 0) {
            lastIteration = {
                endDate: new Date(lastIteration.endDate.getTime() + twoWeeksInMillis)
            };
            var iterationLabel = Rally.util.DateTime.formatWithDefault(lastIteration.endDate);
            categories.push(iterationLabel);
            backlogRemaining -= last3AverageActuals;
            // clamp it to zero
            backlogRemaining = Math.max(0, backlogRemaining);
            data.push(backlogRemaining);
        }

        return data;
    },

    getMatchingIterations: function(snapshot) {
        var matches = [];
        for (var i = 0, l = this.iterations.length; i < l; i++) {
            var iteration = this.iterations[i];
            var iterationEnd = Rally.util.DateTime.toIsoString(iteration.get('EndDate'), true);
            var iterationStart = iteration.get('StartDate').getTime();
            var today = new Date().getTime();
            if (snapshot._ValidFrom <= iterationEnd && snapshot._ValidTo > iterationEnd && iterationStart <= today) {
                matches.push(iteration);
            }
        }

        return matches;
    },
    
    getActualSeriesDataFromWsapi: function() {
        var series = [];
        var total_by_iteration = {};
        
        Ext.Array.each(this.items_in_release,function(item){
            if ( item.get('Iteration') && item.get('AcceptedDate') ) {
                var old_total = total_by_iteration[item.get('Iteration').Name] || 0;
                var plan_estimate = item.get('PlanEstimate') || 0;
                total_by_iteration[item.get('Iteration').Name] = old_total + plan_estimate;
            }
        });
        
        for (var i = 0, il = this.iterations.length; i < il; i++) {
            iteration = this.iterations[i];
            var iteration_total = total_by_iteration[iteration.get('Name')] || 0;
            series.push(iteration_total);
        }
        return series;
    },
    getCumulativeActualSeriesDataFromWsapi: function(actualSeriesData) {
        var series = [];
        var total = 0;
        Ext.Array.each(actualSeriesData, function(value){
            series.push(total);
            total = total + value;
        });
        return series;
    }

});
