define([
    "mage/translate",
    "Magento_PageBuilder/js/config",
    "Magento_PageBuilder/js/content-type/column/resize"
], function ($t, Config, resize) {
    "use strict";

    /**
     * Retrieve default grid size
     *
     * @returns {number}
     */
    function getDefaultGridSize() {
        return parseInt(Config.getConfig("column_grid_default"), 10);
    }

    /**
     * Retrieve the max grid size
     *
     * @returns {number}
     */
    function getMaxGridSize() {
        return parseInt(Config.getConfig("column_grid_max"), 10);
    }

    /**
     * Apply the new grid size, adjusting the existing columns as needed.
     *
     * @param {ContentTypeCollectionInterface<Preview>} columnGroup
     * @param {number} newGridSize
     * @param {Map<number, number[]>} gridSizeHistory
     */
    function resizeGrid(columnGroup, newGridSize, gridSizeHistory) {
        if (newGridSize === columnGroup.preview.getResizeUtils().getInitialGridSize()) {
            return;
        }

        validateNewGridSize(columnGroup, newGridSize);

        columnGroup.getChildren()().forEach(function (columnLine) {
            if (newGridSize < columnLine.getChildren()().length) {
                removeEmptyColumnsToFit(columnLine, newGridSize);
            }
        });

        redistributeColumnWidths(columnGroup, newGridSize, gridSizeHistory);
    }

    /**
     * Validate that the new grid size is within the configured limits
     *
     * @param {ContentTypeCollectionInterface<Preview>} columnGroup
     * @param {number} newGridSize
     */
    function validateNewGridSize(columnGroup, newGridSize) {
        if (newGridSize > getMaxGridSize()) {
            throw new GridSizeError($t("The maximum grid size supported is " + getMaxGridSize() + "."));
        } else if (newGridSize < 2) {
            throw new GridSizeError($t("The minimum grid size supported is 2."));
        }

        var doThrowException = false;
        columnGroup.getChildren()().forEach(function (columnLine) {
            var numEmptyColumns = 0;
            var numCols = columnLine.getChildren()().length;
            var currentGridSize = columnLine.preview.getResizeUtils().getInitialGridSize();

            if (newGridSize < currentGridSize && numCols > newGridSize) {
                columnLine.getChildren()().forEach(function (column) {
                    if (column.getChildren()().length === 0) {
                        numEmptyColumns++;
                    }
                });

                if (newGridSize < numCols - numEmptyColumns) {
                    doThrowException = true;
                }
            }
        });

        if (doThrowException) {
            throw new Error($t("Grid size cannot be smaller than the current total amount of columns, minus any empty columns."));
        }
    }

    /**
     * Remove empty columns so we can accommodate the new grid size
     *
     * @param {ContentTypeCollectionInterface<Preview>} columnLine
     * @param {number} newGridSize
     */
    function removeEmptyColumnsToFit(columnLine, newGridSize) {
        var columns = columnLine.getChildren()();
        var numColumns = columns.length;

        for (var i = numColumns - 1; i >= 0; i--) {
            var column = columns[i];
            if (newGridSize < numColumns && column.getChildren()().length === 0) {
                columnLine.removeChild(column);
                numColumns--;
            }
        }
    }

    /**
     * Adjust columns widths across the new grid size
     *
     * @param {ContentTypeCollectionInterface<Preview>} columnGroup
     * @param {number} newGridSize
     * @param {Map<number, number[]>} gridSizeHistory
     */
    function redistributeColumnWidths(columnGroup, newGridSize, gridSizeHistory) {
        if (gridSizeHistory.has(newGridSize) &&
            gridSizeHistory.get(newGridSize).length === columnGroup.getChildren()().length) {
            var columnWidths = gridSizeHistory.get(newGridSize);
            columnGroup.getChildren()().forEach(function (column, index) {
                resize.updateColumnWidth(column, columnWidths[index]);
            });
            columnGroup.dataStore.set("grid_size", newGridSize);
            columnGroup.dataStore.unset("initial_grid_size");
            return;
        }

        var columnGroupResizeUtil = columnGroup.preview.getResizeUtils();
        var existingGridSize = columnGroupResizeUtil.getInitialGridSize();
        var minColWidth = parseFloat((100 / newGridSize).toString()).toFixed(
            Math.round(100 / newGridSize) !== 100 / newGridSize ? 8 : 0
        );

        columnGroup.getChildren()().forEach(function (columnLine) {
            var totalNewWidths = 0;
            var remainingWidth = 0;
            var numColumns = columnLine.getChildren()().length;
            var resizeUtils = columnLine.preview.getResizeUtils();

            columnLine.getChildren()().forEach(function (column, index) {
                var existingWidth = resizeUtils.getColumnWidth(column);
                var fractionColumnWidth = Math.round(existingWidth / (100 / existingGridSize));

                if ((existingGridSize > newGridSize && existingGridSize % newGridSize === 0 ||
                    existingGridSize < newGridSize && newGridSize % existingGridSize === 0) &&
                    newGridSize % numColumns === 0 &&
                    newGridSize / existingGridSize * fractionColumnWidth % 1 === 0) {
                    totalNewWidths += existingWidth;
                } else {
                    var newWidth = (100 * Math.floor(existingWidth / 100 * newGridSize) / newGridSize).toFixed(
                        Math.round(100 / newGridSize) !== 100 / newGridSize ? 8 : 0
                    );

                    if (parseFloat(newWidth) < parseFloat(minColWidth)) {
                        newWidth = minColWidth;
                    }

                    var maxAvailableWidth = 100 - totalNewWidths;
                    if (parseFloat(newWidth) > maxAvailableWidth) {
                        var gridWidth = Math.round(100 / newGridSize) !== 100 / newGridSize ? 8 : 0;
                        newWidth = maxAvailableWidth.toFixed(gridWidth);
                    }

                    remainingWidth += existingWidth - parseFloat(newWidth);

                    if (resizeUtils.getSmallestColumnWidth(newGridSize) ===
                        resizeUtils.getAcceptedColumnWidth(remainingWidth.toString(), newGridSize)) {
                        var widthWithRemaining = resizeUtils.getAcceptedColumnWidth(
                            (parseFloat(newWidth) + remainingWidth).toString(),
                            newGridSize
                        );

                        if (widthWithRemaining > 0) {
                            newWidth = widthWithRemaining.toFixed(
                                Math.round(100 / widthWithRemaining) !== 100 / widthWithRemaining ? 8 : 0
                            );
                            remainingWidth = 0;
                        }
                    }

                    totalNewWidths += parseFloat(newWidth);
                    resize.updateColumnWidth(column, parseFloat(newWidth));
                }

                column.preview.updateDisplayLabel();
            });
        });

        columnGroup.dataStore.set("grid_size", newGridSize);
        columnGroup.dataStore.unset("initial_grid_size");

        columnGroup.getChildren()().forEach(function (columnLine) {
            var resizeUtils = columnLine.preview.getResizeUtils();
            if (Math.round(resizeUtils.getColumnsWidth()) < 100) {
                applyLeftoverColumnsInColumnLine(columnLine, newGridSize);
            }
        });
    }

    /**
     * Make sure the full grid size is distributed across the columns in a line
     *
     * @param {ContentTypeCollectionInterface<Preview>} columnLine
     * @param {number} newGridSize
     */
    function applyLeftoverColumnsInColumnLine(columnLine, newGridSize) {
        var resizeUtils = columnLine.preview.getResizeUtils();
        var minColWidth = parseFloat((100 / newGridSize).toString()).toFixed(
            Math.round(100 / newGridSize) !== 100 / newGridSize ? 8 : 0
        );

        columnLine.getChildren()().forEach(function (column) {
            if (Math.round(resizeUtils.getColumnsWidth()) < 100) {
                resize.updateColumnWidth(
                    column,
                    parseFloat(resizeUtils.getColumnWidth(column).toString()) + parseFloat(minColWidth)
                );
            }
        });
    }

    /**
     * Grid Size Error class
     */
    function GridSizeError(message) {
        this.name = "GridSizeError";
        this.message = message;
    }
    GridSizeError.prototype = Object.create(Error.prototype);
    GridSizeError.prototype.constructor = GridSizeError;

    return {
        getDefaultGridSize: getDefaultGridSize,
        getMaxGridSize: getMaxGridSize,
        resizeGrid: resizeGrid,
        GridSizeError: GridSizeError
    };
});
