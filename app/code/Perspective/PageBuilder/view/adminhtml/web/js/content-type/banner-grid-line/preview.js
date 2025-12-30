define([
    "jquery",
    "knockout",
    "Magento_PageBuilder/js/content-type-factory",
    "Perspective_PageBuilder/js/content-type/banner-grid-group/factory",
    "Perspective_PageBuilder/js/content-type/banner-grid-group/registry",
    "Magento_PageBuilder/js/drag-drop/move-content-type",
    "Magento_PageBuilder/js/drag-drop/registry",
    "Magento_PageBuilder/js/drag-drop/sortable",
    "Magento_PageBuilder/js/events",
    "Magento_PageBuilder/js/utils/create-stylesheet",
    "underscore",
    "Magento_PageBuilder/js/config",
    "Perspective_PageBuilder/js/content-type/banner-grid-group/grid-size",
    "Magento_PageBuilder/js/content-type/column/resize",
    "Magento_PageBuilder/js/content-type/preview-collection",
    "Perspective_PageBuilder/js/content-type/banner-grid-line/drag-and-drop"
], function (
    $,
    ko,
    createContentType,
    columnFactory,
    columnRegistry,
    moveContentType,
    dragDropRegistry,
    sortable,
    events,
    createStylesheet,
    _,
    Config,
    gridSize,
    resize,
    PreviewCollection,
    dragAndDrop
) {
    "use strict";

    var Preview = function (_previewCollection) {
        function Preview(contentType, config, observableUpdater) {
            var _this;

            _this = _previewCollection.call(this, contentType, config, observableUpdater) || this;
            _this.resizing = ko.observable(false);
            _this.gridSizeArray = ko.observableArray([]);
            _this.dropPositions = [];
            _this.resizeHistory = { left: [], right: [] };
            _this.interactionLevel = 0;
            _this.lineDropperHeight = 50;
            _this.resizeUtils = new resize(_this.contentType.parentContentType, _this.contentType);

            events.on("contentType:removeAfter", function (args) {
                if (args.parentContentType && args.parentContentType.id === _this.contentType.id) {
                    _.defer(function () {
                        _this.spreadWidth(args.index);
                    });
                }
            });

            events.on("banner-grid-item:resizeHandleBindAfter", function (args) {
                if (args.columnLine.id === _this.contentType.id) {
                    _this.registerResizeHandle(args.column, args.handle);
                }
            });

            events.on("banner-grid-item:initializeAfter", function (args) {
                if (args.columnGroup.id === _this.contentType.id) {
                    _this.bindDraggable(args.column);
                }
            });

            var parentPreview = _this.contentType.parentContentType.preview;
            _this.gridSizeArray(parentPreview.gridSizeArray());
            parentPreview.gridSizeArray.subscribe(function (size) {
                _this.gridSizeArray(size);
            });

            _this.contentType.children.subscribe(_.debounce(_this.removeIfEmpty.bind(_this), 50));

            return _this;
        }

        Preview.prototype = Object.create(_previewCollection.prototype);
        Preview.prototype.constructor = Preview;

        Preview.prototype.bindEvents = function () {
            var _this = this;
            _previewCollection.prototype.bindEvents.call(this);

            if (Config.getContentTypeConfig("banner-grid-item")) {
                events.on("banner-grid-line:dropAfter", function (args) {
                    if (args.id === _this.contentType.id) {
                        _this.createColumns();
                    }
                });
            }

            events.on("banner-grid-item:initializeAfter", function (args) {
                if (args.columnLine.id === _this.contentType.id) {
                    _this.bindDraggable(args.column);
                }
            });
        };

        Preview.prototype.bindInteractions = function (line) {
            this.element = $(line);
            this.initDroppable(this.element);
            this.initMouseMove(this.element);
        };

        Preview.prototype.bindDropPlaceholder = function (element) {
            this.dropPlaceholder = $(element);
        };

        Preview.prototype.bindColumnLineBottomDropPlaceholder = function (element) {
            this.columnLineBottomDropPlaceholder = $(element);
        };

        Preview.prototype.bindColumnLineDropPlaceholder = function (element) {
            this.columnLineDropPlaceholder = $(element);
        };

        Preview.prototype.bindMovePlaceholder = function (element) {
            this.movePlaceholder = $(element);
        };

        Preview.prototype.bindGhost = function (ghost) {
            this.resizeGhost = $(ghost);
        };

        Preview.prototype.getResizeUtils = function () {
            return this.resizeUtils;
        };

        Preview.prototype.bindDraggable = function (column) {
            var _this = this;
            column.preview.element.draggable({
                appendTo: "body",
                containment: "body",
                cursor: "-webkit-grabbing",
                handle: ".move-column",
                revertDuration: 250,
                helper: function () {
                    var helper = $(this).clone();
                    helper.css({
                        height: $(this).outerHeight() + "px",
                        minHeight: 0,
                        opacity: 0.5,
                        pointerEvents: "none",
                        width: $(this).outerWidth() + "px",
                        zIndex: 5000
                    });
                    return helper;
                },
                start: function (event) {
                    var columnInstance = ko.dataFor($(event.target)[0]);
                    columnRegistry.setDragColumn(columnInstance.contentType);
                    _this.dropPositions = dragAndDrop.calculateDropPositions(_this.contentType);
                    _this.startDragEvent = event;

                    events.trigger("banner-grid-item:dragStart", {
                        column: columnInstance,
                        stageId: _this.contentType.stageId
                    });

                    events.trigger("stage:interactionStart", {
                        stageId: _this.contentType.stageId
                    });
                },
                stop: function () {
                    var draggedColumn = columnRegistry.getDragColumn();

                    if (_this.movePosition && draggedColumn) {
                        if (draggedColumn.parentContentType === _this.contentType) {
                            _this.onColumnSort(draggedColumn, _this.movePosition.insertIndex);
                            _this.movePosition = null;
                        }
                    }

                    columnRegistry.removeDragColumn();
                    _this.dropPlaceholder.removeClass("left right");
                    _this.movePlaceholder.removeClass("active");
                    _this.movePosition = null;
                    _this.startDragEvent = null;

                    events.trigger("banner-grid-item:dragStop", {
                        column: draggedColumn,
                        stageId: _this.contentType.stageId
                    });

                    events.trigger("stage:interactionStop", {
                        stageId: _this.contentType.stageId
                    });
                }
            });
        };

        Preview.prototype.onColumnSort = function (column, newIndex) {
            var currentIndex = resize.getColumnIndexInLine(column);
            if (currentIndex !== newIndex) {
                if (currentIndex < newIndex) {
                    --newIndex;
                }
                moveContentType.moveContentType(column, newIndex);
            }
        };

        Preview.prototype.onNewColumnDrop = function (dropPosition) {
            var _this = this;
            columnFactory.createColumn(
                this.contentType,
                this.resizeUtils.getSmallestColumnWidth(),
                dropPosition.insertIndex
            ).then(function () {
                var newWidth = _this.resizeUtils.getAcceptedColumnWidth(
                    (_this.resizeUtils.getColumnWidth(dropPosition.affectedColumn) -
                        _this.resizeUtils.getSmallestColumnWidth()).toString()
                );
                resize.updateColumnWidth(dropPosition.affectedColumn, newWidth);
            });
        };

        Preview.prototype.onExistingColumnDrop = function (movePosition) {
            var _this = this;
            var column = columnRegistry.getDragColumn();
            var sourceLinePreview = column.parentContentType.preview;
            var modifyOldNeighbour;
            var oldWidth = sourceLinePreview.getResizeUtils().getColumnWidth(column);
            var direction = "+1";

            if (resize.getAdjacentColumn(column, "+1")) {
                modifyOldNeighbour = resize.getAdjacentColumn(column, "+1");
            } else if (resize.getAdjacentColumn(column, "-1")) {
                direction = "-1";
                modifyOldNeighbour = resize.getAdjacentColumn(column, "-1");
            }

            var oldNeighbourWidth = 100;
            if (modifyOldNeighbour) {
                oldNeighbourWidth = sourceLinePreview.getResizeUtils().getAcceptedColumnWidth(
                    (oldWidth + sourceLinePreview.getResizeUtils().getColumnWidth(modifyOldNeighbour)).toString()
                );
            }

            if (this.columnLineDropPlaceholder.hasClass("active")) {
                columnFactory.createColumnLine(
                    this.contentType.parentContentType,
                    this.resizeUtils.getSmallestColumnWidth(),
                    this.getNewColumnLineIndex()
                ).then(function (columnLine) {
                    moveContentType.moveContentType(column, 0, columnLine);
                    resize.updateColumnWidth(column, 100);

                    if (modifyOldNeighbour) {
                        resize.updateColumnWidth(modifyOldNeighbour, oldNeighbourWidth);
                    }

                    _this.fireMountEvent(_this.contentType, column);
                });
            } else if (this.columnLineBottomDropPlaceholder.hasClass("active")) {
                columnFactory.createColumnLine(
                    this.contentType.parentContentType,
                    this.resizeUtils.getSmallestColumnWidth(),
                    this.getNewColumnLineIndex()
                ).then(function (columnLine) {
                    moveContentType.moveContentType(column, 0, columnLine);
                    resize.updateColumnWidth(column, 100);

                    if (modifyOldNeighbour) {
                        resize.updateColumnWidth(modifyOldNeighbour, oldNeighbourWidth);
                    }

                    _this.fireMountEvent(_this.contentType, column);
                });
            } else {
                moveContentType.moveContentType(column, movePosition.insertIndex, this.contentType);

                if (modifyOldNeighbour) {
                    resize.updateColumnWidth(modifyOldNeighbour, oldNeighbourWidth);
                }

                var newNeighbourWidth = this.resizeUtils.getAcceptedColumnWidth(
                    (this.resizeUtils.getColumnWidth(movePosition.affectedColumn) - oldWidth).toString()
                );
                var newNeighbour = movePosition.affectedColumn;
                var totalWidthAdjusted = 0;
                resize.updateColumnWidth(column, oldWidth);

                while (true) {
                    if (newNeighbourWidth <= 0) {
                        newNeighbourWidth = this.resizeUtils.getSmallestColumnWidth();
                        var originalWidthOfNeighbour = this.resizeUtils.getColumnWidth(newNeighbour);
                        resize.updateColumnWidth(newNeighbour, newNeighbourWidth);
                        totalWidthAdjusted += originalWidthOfNeighbour - newNeighbourWidth;
                    } else {
                        resize.updateColumnWidth(newNeighbour, newNeighbourWidth);
                        break;
                    }

                    if (direction === "+1") {
                        newNeighbour = resize.getAdjacentColumn(newNeighbour, "+1");
                    } else {
                        newNeighbour = resize.getAdjacentColumn(newNeighbour, "-1");
                    }

                    if (!newNeighbour) {
                        resize.updateColumnWidth(column, totalWidthAdjusted);
                        break;
                    }

                    var neighbourExistingWidth = this.resizeUtils.getColumnWidth(newNeighbour);
                    newNeighbourWidth = neighbourExistingWidth - (oldWidth - totalWidthAdjusted);

                    if (newNeighbourWidth < 0.001) {
                        newNeighbourWidth = 0;
                    }
                }

                var totalWidth = 0;
                var _this2 = this;
                this.contentType.children().forEach(function (columnChild) {
                    totalWidth += _this2.resizeUtils.getColumnWidth(columnChild);
                });

                if (totalWidth > 100) {
                    resize.updateColumnWidth(column, this.resizeUtils.getColumnWidth(column) - (totalWidth - 100));
                }
            }
        };

        Preview.prototype.initMouseMove = function (line) {
            var _this = this;
            var intersects = false;

            $(document).on("mousemove touchmove", function (event) {
                if (line.parents(sortable.hiddenClass).length > 0) {
                    return;
                }

                var linePosition = _this.getLinePosition(line);

                if (event.type === "touchmove") {
                    event.pageX = event.originalEvent.pageX;
                    event.pageY = event.originalEvent.pageY;
                }

                if (_this.eventIntersectsLine(event, linePosition)) {
                    intersects = true;
                    _this.onResizingMouseMove(event, line, linePosition);
                    _this.onDraggingMouseMove(event, line, linePosition);
                    _this.onDroppingMouseMove(event, line, linePosition);
                } else {
                    intersects = false;
                    _this.linePositionCache = null;
                    _this.dropPosition = null;
                    _this.dropPlaceholder.removeClass("left right");
                    _this.columnLineDropPlaceholder.removeClass("active");
                    _this.columnLineBottomDropPlaceholder.removeClass("active");
                    _this.columnLineBottomDropPlaceholder.hide();
                    _this.columnLineDropPlaceholder.hide();
                }
            }).on("mouseup touchend", function () {
                if (intersects) {
                    _this.handleMouseUp();
                }

                intersects = false;
                _this.dropPosition = null;
                _this.endAllInteractions();

                _.defer(function () {
                    line.find(".ui-sortable").each(function () {
                        if ($(this).data("ui-sortable")) {
                            $(this).sortable("option", "disabled", false);
                        }
                    });
                });
            });
        };

        Preview.prototype.endAllInteractions = function () {
            if (this.resizing() === true) {
                for (; this.interactionLevel > 0; this.interactionLevel--) {
                    events.trigger("stage:interactionStop", { stageId: this.contentType.stageId });
                }
            }

            this.linePositionCache = null;
            this.dropPosition = null;
            this.dropPlaceholder.removeClass("left right");
            this.columnLineDropPlaceholder.removeClass("active");
            this.columnLineBottomDropPlaceholder.removeClass("active");
            this.columnLineBottomDropPlaceholder.hide();
            this.columnLineDropPlaceholder.hide();
            this.resizing(false);
            this.resizeMouseDown = null;
            this.resizeLeftLastColumnShrunk = this.resizeRightLastColumnShrunk = null;
            this.dropPositions = [];
            this.unsetResizingColumns();
            $("body").css("cursor", "");
            this.movePlaceholder.css("left", "").removeClass("active");
            this.resizeGhost.removeClass("active");
            this.linePositionCache = null;
        };

        Preview.prototype.handleMouseUp = function () {
            var self = this;
            var dragColumn = columnRegistry.getDragColumn();

            if ((this.columnLineDropPlaceholder.hasClass("active") ||
                this.columnLineBottomDropPlaceholder.hasClass("active")) && !dragColumn) {
                columnFactory.createColumnLine(
                    this.contentType.parentContentType,
                    this.resizeUtils.getSmallestColumnWidth(),
                    this.getNewColumnLineIndex()
                ).then(function (columnLine) {
                    events.trigger(columnLine.config.name + ":dropAfter", {
                        id: columnLine.id,
                        columnLine: columnLine
                    });
                });
                return;
            }

            if (this.dropOverElement && this.dropPosition) {
                this.onNewColumnDrop(this.dropPosition);
                this.dropOverElement = null;

                _.defer(function () {
                    $(".element-children.ui-sortable-disabled").each(function () {
                        $(this).sortable("option", "disabled", false);
                    });
                });
            }

            var column = columnRegistry.getDragColumn();
            if (this.isColumnBeingMovedToAnotherColumnLine()) {
                this.onExistingColumnDrop(this.movePosition);
            }
        };

        Preview.prototype.eventIntersectsLine = function (event, groupPosition) {
            return event.pageY > groupPosition.top &&
                event.pageY < groupPosition.top + groupPosition.outerHeight &&
                event.pageX > groupPosition.left &&
                event.pageX < groupPosition.left + groupPosition.outerWidth;
        };

        Preview.prototype.onDraggingMouseMove = function (event, line, linePosition) {
            var dragColumn = columnRegistry.getDragColumn();

            if (dragColumn) {
                if (this.dropPositions.length === 0) {
                    this.dropPositions = dragAndDrop.calculateDropPositions(this.contentType);
                }

                var columnInstance = dragColumn;
                var currentX = event.pageX - linePosition.left;

                if (columnInstance.parentContentType === this.contentType && this.startDragEvent) {
                    var dragDirection = event.pageX <= this.startDragEvent.pageX ? "left" : "right";
                    var adjacentLeftColumn = resize.getAdjacentColumn(dragColumn, "-1");

                    this.movePosition = this.dropPositions.find(function (position) {
                        return currentX > position.left && currentX < position.right &&
                            position.placement === dragDirection &&
                            position.affectedColumn !== dragColumn;
                    });

                    if (this.movePosition && dragDirection === "right" &&
                        this.movePosition.affectedColumn === adjacentLeftColumn) {
                        this.movePosition = null;
                    }

                    if (this.movePosition &&
                        !this.isNewLinePlaceDropPlaceholderVisible(event, linePosition) &&
                        !this.isNewLineBottomPlaceDropPlaceholderVisible(event, linePosition)) {
                        this.dropPlaceholder.removeClass("left right");
                        this.movePlaceholder.css({
                            left: this.movePosition.placement === "left" ? this.movePosition.left : "",
                            right: this.movePosition.placement === "right" ?
                                linePosition.width - this.movePosition.right : "",
                            width: dragColumn.preview.element.outerWidth() + "px"
                        }).addClass("active");
                    } else {
                        this.movePlaceholder.removeClass("active");
                    }
                } else {
                    this.movePosition = this.dropPositions.find(function (position) {
                        return currentX > position.left && currentX <= position.right && position.canShrink;
                    });

                    if (this.movePosition && !this.isNewLinePlaceDropPlaceholderVisible(event, linePosition)) {
                        var classToRemove = this.movePosition.placement === "left" ? "right" : "left";
                        this.movePlaceholder.removeClass("active");
                        this.dropPlaceholder.removeClass(classToRemove).css({
                            left: this.movePosition.placement === "left" ? this.movePosition.left : "",
                            right: this.movePosition.placement === "right" ?
                                linePosition.width - this.movePosition.right : "",
                            width: linePosition.width / this.resizeUtils.getGridSize() + "px"
                        }).addClass(this.movePosition.placement);
                    } else {
                        this.dropPlaceholder.removeClass("left right");
                    }
                }
            }
        };

        Preview.prototype.onResizingMouseMove = function (event, group, groupPosition) {
            var _this = this;
            var newColumnWidth;

            if (this.resizeMouseDown) {
                event.preventDefault();
                var currentPos = event.pageX;
                var resizeColumnLeft = this.resizeColumnInstance.preview.element.offset().left;
                var resizeColumnWidth = this.resizeColumnInstance.preview.element.outerWidth();
                var resizeHandlePosition = resizeColumnLeft + resizeColumnWidth;
                var direction = currentPos >= resizeHandlePosition ? "right" : "left";
                var adjustedColumn, modifyColumnInPair, usedHistory;

                var result = this.resizeUtils.determineAdjustedColumn(
                    currentPos, this.resizeColumnInstance, this.resizeHistory
                );
                adjustedColumn = result[0];
                modifyColumnInPair = result[1];
                usedHistory = result[2];

                var ghostWidth = this.resizeUtils.calculateGhostWidth(
                    groupPosition, currentPos, this.resizeColumnInstance,
                    modifyColumnInPair, this.resizeMaxGhostWidth
                );
                this.resizeGhost.width(ghostWidth - 15 + "px").addClass("active");

                if (adjustedColumn && this.resizeColumnWidths) {
                    newColumnWidth = this.resizeColumnWidths.find(function (val) {
                        return resize.comparator(currentPos, val.position, 35) &&
                            val.forColumn === modifyColumnInPair;
                    });

                    if (newColumnWidth) {
                        var mainColumn = this.resizeColumnInstance;

                        if (modifyColumnInPair === "right") {
                            mainColumn = resize.getAdjacentColumn(this.resizeColumnInstance, "+1");
                        }

                        if (this.resizeUtils.getColumnWidth(mainColumn) !== newColumnWidth.width &&
                            !resize.comparator(this.resizeLastPosition, newColumnWidth.position, 10)) {

                            if (usedHistory && this.resizeLastColumnInPair === "right" &&
                                direction === "right" && newColumnWidth.forColumn === "left") {
                                var originalMainColumn = mainColumn;
                                mainColumn = adjustedColumn;
                                adjustedColumn = resize.getAdjacentColumn(originalMainColumn, "+1");
                            }

                            this.recordResizeHistory(usedHistory, direction, adjustedColumn, modifyColumnInPair);
                            this.resizeLastPosition = newColumnWidth.position;
                            this.resizeLastColumnInPair = modifyColumnInPair;
                            this.setColumnsAsResizing(mainColumn, adjustedColumn);
                            this.onColumnResize(mainColumn, newColumnWidth.width, adjustedColumn);

                            _.defer(function () {
                                _this.resizeColumnWidths = _this.resizeUtils.determineColumnWidths(
                                    _this.resizeColumnInstance, groupPosition
                                );
                                _this.resizeMaxGhostWidth = resize.determineMaxGhostWidth(_this.resizeColumnWidths);
                            });
                        }
                    }
                }
            }
        };

        Preview.prototype.unsetResizingColumns = function () {
            this.contentType.children().forEach(function (column) {
                column.preview.resizing(false);
                if (column.preview.element) {
                    column.preview.element.css({ transition: "" });
                }
            });
        };

        Preview.prototype.isNewLinePlaceDropPlaceholderVisible = function (event, linePosition) {
            var draggedColumn = columnRegistry.getDragColumn();
            return (this.dropOverElement || draggedColumn) &&
                event.pageY > linePosition.top + 15 &&
                event.pageY < linePosition.top + 15 + this.lineDropperHeight;
        };

        Preview.prototype.isNewLineBottomPlaceDropPlaceholderVisible = function (event, linePosition) {
            var draggedColumn = columnRegistry.getDragColumn();
            return (this.dropOverElement || draggedColumn) &&
                event.pageY < linePosition.top + 15 + this.element.outerHeight() &&
                event.pageY > linePosition.top + 15 + this.element.outerHeight() - this.lineDropperHeight;
        };

        Preview.prototype.isNewColumnDropPlaceholderVisible = function (event, linePosition) {
            var draggedColumn = columnRegistry.getDragColumn();
            return (this.dropOverElement || draggedColumn) &&
                event.pageY > linePosition.top + 15 + this.lineDropperHeight &&
                event.pageY < linePosition.top + 15 + linePosition.outerHeight - this.lineDropperHeight;
        };

        Preview.prototype.onDroppingMouseMove = function (event, line, linePosition) {
            var elementChildrenParent = line.parents(".element-children");

            if (this.isNewLinePlaceDropPlaceholderVisible(event, linePosition)) {
                this.dropPosition = null;
                this.dropPlaceholder.removeClass("left right");
                this.columnLineDropPlaceholder.addClass("active");
                this.columnLineDropPlaceholder.show();
                return this.handleLineDropMouseMove(event, line, linePosition);
            } else if (this.isNewLineBottomPlaceDropPlaceholderVisible(event, linePosition)) {
                this.dropPosition = null;
                this.dropPlaceholder.removeClass("left right");
                this.columnLineBottomDropPlaceholder.addClass("active");
                this.columnLineBottomDropPlaceholder.show();
                return this.handleLineDropMouseMove(event, line, linePosition);
            } else if (this.dropOverElement) {
                this.columnLineDropPlaceholder.hide();
                this.columnLineBottomDropPlaceholder.hide();
                this.columnLineBottomDropPlaceholder.removeClass("active");
                this.columnLineDropPlaceholder.removeClass("active");
            }

            if (this.isNewColumnDropPlaceholderVisible(event, linePosition)) {
                this.columnLineDropPlaceholder.hide();
                this.columnLineDropPlaceholder.removeClass("active");
                this.columnLineBottomDropPlaceholder.hide();
                this.columnLineBottomDropPlaceholder.removeClass("active");
                return this.handleColumnDropMouseMove(event, line, linePosition);
            }
        };

        Preview.prototype.handleLineDropMouseMove = function (event, line, linePosition) {
            var elementChildrenParent = line.parents(".element-children");
            if (elementChildrenParent.data("ui-sortable")) {
                elementChildrenParent.sortable("option", "disabled", true);
            }
        };

        Preview.prototype.handleColumnDropMouseMove = function (event, line, linePosition) {
            var elementChildrenParent = line.parents(".element-children");

            if (this.dropOverElement && event.pageY > linePosition.top + 50 &&
                event.pageY < linePosition.top + linePosition.outerHeight - 50) {

                if (elementChildrenParent.data("ui-sortable")) {
                    elementChildrenParent.sortable("option", "disabled", true);
                }

                var currentX = event.pageX - linePosition.left;
                this.dropPosition = this.dropPositions.find(function (position) {
                    return currentX > position.left && currentX <= position.right && position.canShrink;
                });

                if (this.dropPosition) {
                    this.dropPlaceholder.removeClass("left right").css({
                        left: this.dropPosition.placement === "left" ? this.dropPosition.left : "",
                        right: this.dropPosition.placement === "right" ?
                            linePosition.width - this.dropPosition.right : "",
                        width: linePosition.width / this.resizeUtils.getGridSize() + "px"
                    }).addClass(this.dropPosition.placement);
                }
            } else if (this.dropOverElement) {
                if (elementChildrenParent.data("ui-sortable")) {
                    elementChildrenParent.sortable("option", "disabled", false);
                }

                this.dropPosition = null;
                this.dropPlaceholder.removeClass("left right");
            }
        };

        Preview.prototype.getLinePosition = function (line) {
            if (!this.linePositionCache) {
                this.linePositionCache = {
                    top: line.offset().top,
                    left: line.offset().left,
                    width: line.width(),
                    height: line.height(),
                    outerWidth: line.outerWidth(),
                    outerHeight: line.outerHeight()
                };
            }
            return this.linePositionCache;
        };

        Preview.prototype.initDroppable = function (line) {
            var self = this;
            var headStyles;

            line.droppable({
                deactivate: function () {
                    self.dropOverElement = null;
                    self.dropPlaceholder.removeClass("left right");

                    _.defer(function () {
                        line.parents(".element-children").each(function () {
                            if ($(this).data("ui-sortable")) {
                                $(this).sortable("option", "disabled", false);
                            }
                        });
                    });
                },
                activate: function () {
                    if (dragDropRegistry.getDraggedContentTypeConfig() ===
                        Config.getContentTypeConfig("banner-grid-group")) {

                        line.find(".ui-sortable").each(function () {
                            if ($(this).data("ui-sortable")) {
                                $(this).sortable("option", "disabled", true);
                            }
                        });

                        var classes = [
                            ".pagebuilder-content-type.pagebuilder-banner-grid-item .pagebuilder-drop-indicator",
                            ".pagebuilder-content-type.pagebuilder-banner-grid-item .empty-container .content-type-container:before"
                        ];
                        var styles = {};
                        styles[classes.join(", ")] = { display: "none!important" };
                        headStyles = createStylesheet.createStyleSheet(styles);
                        document.head.appendChild(headStyles);
                    } else if (headStyles) {
                        headStyles.remove();
                        headStyles = null;
                    }
                },
                drop: function () {
                    self.dropPositions = [];
                    self.dropPlaceholder.removeClass("left right");
                },
                out: function () {
                    self.dropOverElement = null;
                    self.dropPlaceholder.removeClass("left right");
                },
                over: function () {
                    if (dragDropRegistry.getDraggedContentTypeConfig() ===
                        Config.getContentTypeConfig("banner-grid-group") ||
                        dragDropRegistry.getDraggedContentTypeConfig() ===
                        Config.getContentTypeConfig("banner-grid-item")) {

                        var ownContentType = self.contentType;
                        self.dropPositions = dragAndDrop.calculateDropPositions(ownContentType);
                        self.dropOverElement = true;
                    } else {
                        self.dropOverElement = null;
                    }
                }
            });
        };

        Preview.prototype.spreadWidth = function (removedIndex) {
            var _this = this;
            if (this.contentType.children().length === 0) {
                return;
            }

            var availableWidth = 100 - this.resizeUtils.getColumnsWidth();
            var formattedAvailableWidth = resize.getRoundedColumnWidth(availableWidth);
            var totalChildColumns = this.contentType.children().length;
            var allowedColumnWidths = [];
            var spreadAcross = 1;
            var spreadAmount;

            for (var i = this.resizeUtils.getGridSize(); i > 0; i--) {
                allowedColumnWidths.push(
                    resize.getRoundedColumnWidth(100 / this.resizeUtils.getGridSize() * i)
                );
            }

            for (var i = totalChildColumns; i > 0; i--) {
                var potentialWidth = Math.floor(formattedAvailableWidth / i);
                for (var j = 0; j < allowedColumnWidths.length; j++) {
                    var width = allowedColumnWidths[j];
                    if (potentialWidth === Math.floor(width)) {
                        spreadAcross = i;
                        spreadAmount = formattedAvailableWidth / i;
                        break;
                    }
                }
                if (spreadAmount) {
                    break;
                }
            }

            for (var i = 1; i <= spreadAcross; i++) {
                var columnToModify;

                if (removedIndex <= this.contentType.children().length &&
                    typeof this.contentType.children()[removedIndex] !== "undefined") {
                    columnToModify = this.contentType.children()[removedIndex];
                }

                if (!columnToModify && removedIndex - i >= 0 &&
                    typeof this.contentType.children()[removedIndex - i] !== "undefined") {
                    columnToModify = this.contentType.children()[removedIndex - i];
                }

                if (columnToModify) {
                    resize.updateColumnWidth(
                        columnToModify,
                        this.resizeUtils.getColumnWidth(columnToModify) + spreadAmount
                    );
                }
            }
        };

        Preview.prototype.registerResizeHandle = function (column, handle) {
            var _this = this;
            handle.off("mousedown touchstart");
            handle.on("mousedown touchstart", function (event) {
                event.preventDefault();
                var groupPosition = _this.getLinePosition(_this.element);
                _this.resizing(true);
                _this.resizeColumnInstance = column;
                _this.resizeColumnWidths = _this.resizeUtils.determineColumnWidths(
                    _this.resizeColumnInstance, groupPosition
                );
                _this.resizeMaxGhostWidth = resize.determineMaxGhostWidth(_this.resizeColumnWidths);
                $("body").css("cursor", "col-resize");
                _this.resizeHistory = { left: [], right: [] };
                _this.resizeLastPosition = null;
                _this.resizeMouseDown = true;
                ++_this.interactionLevel;
                events.trigger("stage:interactionStart", { stageId: _this.contentType.stageId });
            });
        };

        Preview.prototype.createColumns = function () {
            var _this = this;
            var defaultGridSize = gridSize.getDefaultGridSize();
            var col1Width = (Math.ceil(defaultGridSize / 2) * 100 / defaultGridSize).toFixed(
                Math.round(100 / defaultGridSize) !== 100 / defaultGridSize ? 8 : 0
            );

            Promise.all([
                createContentType(
                    Config.getContentTypeConfig("banner-grid-item"),
                    this.contentType,
                    this.contentType.stageId,
                    { width: col1Width + "%" }
                ),
                createContentType(
                    Config.getContentTypeConfig("banner-grid-item"),
                    this.contentType,
                    this.contentType.stageId,
                    { width: (100 - parseFloat(col1Width)) + "%" }
                )
            ]).then(function (columns) {
                _this.contentType.addChild(columns[0], 0);
                _this.contentType.addChild(columns[1], 1);

                // Create banner-link inside each column
                var bannerLinkPromises = columns.map(function (column) {
                    return _this.createBannerLinkForColumn(column);
                });

                Promise.all(bannerLinkPromises).then(function (bannerLinks) {
                    _this.fireMountEvent(_this.contentType, columns[0], columns[1]);
                    bannerLinks.forEach(function (bannerLink) {
                        if (bannerLink) {
                            _this.fireMountEvent(bannerLink);
                        }
                    });
                });
            });
        };

        /**
         * Create a banner-link inside the given column
         *
         * @param {ContentTypeCollectionInterface} column
         * @returns {Promise}
         */
        Preview.prototype.createBannerLinkForColumn = function (column) {
            if (Config.getContentTypeConfig("banner-link") && column.getChildren()().length === 0) {
                return createContentType(
                    Config.getContentTypeConfig("banner-link"),
                    column,
                    column.stageId
                ).then(function (bannerLink) {
                    column.addChild(bannerLink, 0);
                    return bannerLink;
                });
            }
            return Promise.resolve(null);
        };

        Preview.prototype.recordResizeHistory = function (usedHistory, direction, adjustedColumn, modifyColumnInPair) {
            if (usedHistory) {
                this.resizeHistory[usedHistory].pop();
            }
            this.resizeHistory[direction].push({
                adjustedColumn: adjustedColumn,
                modifyColumnInPair: modifyColumnInPair
            });
        };

        Preview.prototype.setColumnsAsResizing = function () {
            var columns = Array.prototype.slice.call(arguments);
            columns.forEach(function (column) {
                column.preview.resizing(true);
                column.preview.element.css({ transition: "width 350ms ease-in-out" });
            });
        };

        Preview.prototype.onColumnResize = function (column, width, adjustedColumn) {
            this.resizeUtils.resizeColumn(column, width, adjustedColumn);
        };

        Preview.prototype.fireMountEvent = function () {
            var contentTypes = Array.prototype.slice.call(arguments);
            contentTypes.forEach(function (contentType) {
                events.trigger("contentType:mountAfter", {
                    id: contentType.id,
                    contentType: contentType
                });
                events.trigger(contentType.config.name + ":mountAfter", {
                    id: contentType.id,
                    contentType: contentType
                });
            });
        };

        Preview.prototype.removeIfEmpty = function () {
            if (this.contentType.children().length === 0) {
                this.contentType.parentContentType.removeChild(this.contentType);
            }
        };

        Preview.prototype.getNewColumnLineIndex = function () {
            var index = -1;
            var self = this;

            this.contentType.parentContentType.children().forEach(function (child) {
                index++;
                if (child.id === self.contentType.id) {
                    return false;
                }
            });

            if (this.columnLineBottomDropPlaceholder.hasClass("active")) {
                index++;
            }

            return index;
        };

        Preview.prototype.isColumnBeingMovedToAnotherColumnLine = function () {
            var column = columnRegistry.getDragColumn();

            if (!column) {
                return false;
            }

            if (column.parentContentType !== this.contentType) {
                return true;
            }

            if (column.parentContentType === this.contentType &&
                (this.columnLineDropPlaceholder.hasClass("active") ||
                    this.columnLineBottomDropPlaceholder.hasClass("active"))) {
                return true;
            }

            return false;
        };

        return Preview;
    }(PreviewCollection);

    return Preview;
});
