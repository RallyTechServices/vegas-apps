Ext.define('ActualCalculator', {
    extend: 'Rally.data.lookback.calculator.BaseCalculator',

    runCalculation: function(snapshots) {
        var completedIterationTotals = {};
        var completedStoryIterations = {};

        var incompleteIterationTotals = {};
        var oldTotal, iteration, iterationName;
        for (var s = 0, l = snapshots.length; s < l; s++) {
            var snapshot = snapshots[s];
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
            }
            else {
                for (var iter = 0, iterL = iterations.length; iter < iterL; iter++) {
                    iteration = iterations[iter];
                    iterationName = iteration.get('Name');
                    oldTotal = incompleteIterationTotals[iterationName] || 0;
                    incompleteIterationTotals[iterationName] = oldTotal + snapshot.PlanEstimate;
                }
            }

        }

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

        return {
            series: [
            {
                name: 'Work Done (Current iteration Accepted Points)',
                data: actualSeriesData
            },
                {
                    name: 'Total Work (Cumulative Accepted Points)',
                    data: cumulativeActualSeriesData
                },

                {
                    name: 'Work Increase (Points per iteration)',
                    data: devIncreaseSeriesData,
                    stack: '1'
                },
                {
                    name: 'Backlog Remaining (Total Unaccepted Points)',
                    data: backlogRemainingSeriesData,
                    stack: '1'
                },

                {
                    name: 'Burn down projection',
                    data: backlogBurnProjectionSeriesData
                },
                {
                    name: 'Ideal Line',
                    data: [[0, TotalPoints], [ReleaseIteration, 0]],
                    type: 'line'

                }
                ],
            categories: categories
        };
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
    }

});
