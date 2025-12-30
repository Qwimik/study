define([], function () {
    "use strict";

    var dragColumn;

    /**
     * Retrieve the drag column from the registry
     *
     * @returns {ContentTypeCollectionInterface}
     */
    function getDragColumn() {
        return dragColumn;
    }

    /**
     * Remove the drag column reference
     */
    function removeDragColumn() {
        dragColumn = null;
    }

    /**
     * Set the drag column in the registry
     *
     * @param {ContentTypeCollectionInterface<ColumnPreview>} column
     */
    function setDragColumn(column) {
        dragColumn = column;
    }

    return {
        getDragColumn: getDragColumn,
        removeDragColumn: removeDragColumn,
        setDragColumn: setDragColumn
    };
});
