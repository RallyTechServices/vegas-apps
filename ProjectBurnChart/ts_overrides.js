/**
 * the loading mask wasn't going away!
 */

Ext.override(Rally.ui.chart.Chart,{
    onRender: function () {
        this.callParent(arguments);
        this._unmask();
    }
});

/**
 * Required change for showing a different name for 
 * the empty selection than "Unscheduled"
 */
Ext.override(Rally.ui.combobox.ReleaseComboBox,{
    _toggleUnscheduledEntry: function(selected){
        var unscheduled = this.store.findRecord(this.displayField, this.noEntryText);
        if (unscheduled) {
            unscheduled.set('isSelected', selected);
        }
    },
    _decorateRecords: function() {
        var store = this.store,
            selected;

        if (!store) {
            return;
        }
        selected = this.getDefaultValue();

        store.each(function(record){
            if (record.get('formattedName') === this.noEntryText) {
                record.set('Name', this.noEntryText);
            } else {
                record.set('formattedName', this._truncateName(record.get('Name')));
            }

            //TODO: these are not utc dates
            record.set('formattedStartDate', Rally.util.DateTime.formatWithDefault(record.get(this.startDateField)));
            record.set('formattedEndDate', Rally.util.DateTime.formatWithDefault(record.get(this.endDateField)));

            record.set('isSelected', record.get(this.valueField) === (selected && selected._ref? selected._ref : selected));
        }, this);
    }
});