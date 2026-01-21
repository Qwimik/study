define([], function () {
    "use strict";

    /**
     * Calculate the drop positions of a banner grid line
     *
     * @param {ContentTypeCollectionInterface} line
     * @returns {any[]}
     */
    function calculateDropPositions(line) {
        var resizeUtils = line.preview.getResizeUtils();
        var dropPositions = [];

        line.children().forEach(function (column, index) {
            var left = column.preview.element.position().left;
            var width = column.preview.element.outerWidth(true);
            var canShrink = resizeUtils.getAcceptedColumnWidth(
                resizeUtils.getColumnWidth(column).toString()
            ) > resizeUtils.getSmallestColumnWidth();

            dropPositions.push({
                affectedColumn: column,
                canShrink: canShrink,
                insertIndex: index,
                left: left,
                placement: "left",
                right: left + width / 2
            }, {
                affectedColumn: column,
                canShrink: canShrink,
                insertIndex: index + 1,
                left: left + width / 2,
                placement: "right",
                right: left + width
            });
        });

        return dropPositions;
    }

    return {
        calculateDropPositions: calculateDropPositions
    };
});
