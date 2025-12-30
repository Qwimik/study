define([
    "jquery",
    "knockout",
    "mage/translate",
    "Magento_PageBuilder/js/content-type-menu/hide-show-option",
    "Magento_PageBuilder/js/events",
    "underscore",
    "Magento_PageBuilder/js/config",
    "Magento_PageBuilder/js/content-type-factory",
    "Magento_PageBuilder/js/drag-drop/move-content-type",
    "Magento_PageBuilder/js/drag-drop/registry",
    "Magento_PageBuilder/js/drag-drop/sortable",
    "Magento_PageBuilder/js/utils/check-stage-full-screen",
    "Magento_PageBuilder/js/utils/create-stylesheet",
    "Magento_PageBuilder/js/content-type/column/resize",
    "Magento_PageBuilder/js/content-type/preview-collection",
    "Perspective_PageBuilder/js/content-type/banner-grid-group/drag-and-drop",
    "Perspective_PageBuilder/js/content-type/banner-grid-group/factory",
    "Perspective_PageBuilder/js/content-type/banner-grid-group/grid-size",
    "Perspective_PageBuilder/js/content-type/banner-grid-group/registry"
], function (
    $,
    ko,
    $t,
    HideShowOption,
    events,
    _,
    Config,
    createContentType,
    moveContentType,
    dragDropRegistry,
    sortable,
    checkStageFullScreen,
    createStylesheet,
    resize,
    PreviewCollection,
    dragAndDrop,
    columnFactory,
    gridSize,
    columnRegistry
) {
    "use strict";

    var Preview = function (_previewCollection) {
        function Preview(contentType, config, observableUpdater) {
            var _this;

            _this = _previewCollection.call(this, contentType, config, observableUpdater) || this;
            _this.resizing = ko.observable(false);
            _this.hasEmptyChild = ko.computed(function () {
                var empty = false;
                _this.contentType.getChildren()().forEach(function (column) {
                    if (column.getChildren()().length === 0) {
                        empty = true;
                    }
                });
                return empty;
            });
            _this.gridSize = ko.observable();
            _this.gridSizeInput = ko.observable();
            _this.gridSizeArray = ko.observableArray([]);
            _this.gridSizeError = ko.observable();
            _this.gridSizeMax = ko.observable(gridSize.getMaxGridSize());
            _this.gridFormOpen = ko.observable(false);
            _this.gridChange = ko.observable(false);
            _this.gridToolTipOverFlow = ko.observable(false);
            _this.resizeColumnWidths = [];
            _this.resizeHistory = {
                left: [],
                right: []
            };
            _this.dropPositions = [];
            _this.gridSizeHistory = new Map();
            _this.interactionLevel = 0;
            _this.resizeUtils = new resize(_this.contentType);

            _this.contentType.dataStore.subscribe(function (state) {
                var size = parseInt(state.grid_size.toString(), 10);
                _this.gridSize(size);
                _this.gridSizeInput(size);
                if (size) {
                    _this.gridSizeArray(new Array(size));
                }
            }, "grid_size");

            events.on("contentType:removeAfter", function (args) {
                if (args.parentContentType && args.parentContentType.id === _this.contentType.id) {
                    _.defer(function () {
                        _this.spreadWidth(args.index);
                    });
                }
            });

            events.on("banner-grid-item:initializeAfter", function (args) {
                if (args.columnGroup.id === _this.contentType.id) {
                    _this.bindDraggable(args.column);
                }
            });

            events.on("stage:" + _this.contentType.stageId + ":readyAfter", _this.moveContentsToNewColumnGroup.bind(_this));

            events.on("banner-grid-group:renderAfter", function (args) {
                if (args.contentType.id === _this.contentType.id) {
                    if (!_this.hasColumnLine(args.contentType)) {
                        args.element.classList.add("no-column-line");
                    } else {
                        args.element.classList.remove("no-column-line");
                        args.element.classList.add("with-column-line");
                    }
                }
            });

            _this.contentType.children.subscribe(_.debounce(_this.removeIfEmpty.bind(_this), 50));

            return _this;
        }

        // Inherit from PreviewCollection
        Preview.prototype = Object.create(_previewCollection.prototype);
        Preview.prototype.constructor = Preview;

        Preview.prototype.onOptionEdit = function () {
            var appearance = this.contentType.dataStore.get("appearance") ? this.contentType.dataStore.get("appearance") : "default";
            this.contentType.dataStore.set("appearance", appearance);
            this.contentType.dataStore.set("non_empty_column_count", this.getNonEmptyColumnCount());
            this.contentType.dataStore.set("max_grid_size", gridSize.getMaxGridSize());
            this.contentType.dataStore.set("initial_grid_size", this.contentType.dataStore.get("grid_size"));
            _previewCollection.prototype.openEdit.call(this);
        };

        Preview.prototype.bindEvents = function () {
            var _this = this;
            _previewCollection.prototype.bindEvents.call(this);

            if (Config.getContentTypeConfig("banner-grid-item")) {
                events.on("banner-grid-group:dropAfter", function (args) {
                    if (args.id === _this.contentType.id) {
                        _this.setDefaultGridSizeOnColumnGroup();
                        _this.addDefaultColumnLine(args);
                    }
                });
            }

            events.on("form:" + this.contentType.id + ":saveAfter", function () {
                if (_this.contentType.dataStore.get("grid_size") !== _this.contentType.dataStore.get("initial_grid_size")) {
                    _this.updateGridSize();
                }
            });
        };

        Preview.prototype.setDefaultGridSizeOnColumnGroup = function () {
            this.contentType.dataStore.set("grid_size", gridSize.getDefaultGridSize());
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
                _this.fireMountEvent(_this.contentType, columns[0], columns[1]);
            });
        };

        Preview.prototype.addDefaultColumnLine = function (args) {
            var _this = this;
            createContentType(
                Config.getContentTypeConfig("banner-grid-line"),
                this.contentType,
                this.contentType.stageId
            ).then(function (columnLine) {
                _this.contentType.addChild(columnLine, 0);

                if (args.columnGroupWithoutColumnLine === undefined) {
                    events.trigger(columnLine.config.name + ":dropAfter", {
                        id: columnLine.id,
                        columnLine: columnLine
                    });
                } else {
                    var children = args.columnGroupWithoutColumnLine.getChildren()();
                    var index = 0;
                    children.forEach(function (child) {
                        setTimeout(function () {
                            moveContentType.moveContentType(child, index++, columnLine);
                        }, 250);
                    });
                }

                _this.fireMountEvent(_this.contentType, columnLine);
            });
        };

        Preview.prototype.retrieveOptions = function () {
            var options = _previewCollection.prototype.retrieveOptions.call(this);
            options.hideShow = new HideShowOption({
                preview: this,
                icon: HideShowOption.showIcon,
                title: HideShowOption.showText,
                action: this.onOptionVisibilityToggle,
                classes: ["hide-show-content-type"],
                sort: 40
            });
            return options;
        };

        Preview.prototype.getStyle = function (element, styleProperties) {
            var stylesObject = element.style();
            return styleProperties.reduce(function (obj, key) {
                obj[key] = stylesObject[key];
                return obj;
            }, {});
        };

        Preview.prototype.getStyleWithout = function (element, styleProperties) {
            var stylesObject = element.style();
            return Object.keys(stylesObject).filter(function (key) {
                return !styleProperties.includes(key);
            }).reduce(function (obj, key) {
                obj[key] = stylesObject[key];
                return obj;
            }, {});
        };

        Preview.prototype.getBackgroundImage = function () {
            var mobileImage = this.contentType.dataStore.get("mobile_image");
            var desktopImage = this.contentType.dataStore.get("background_image");
            var backgroundImage = this.viewport() === "mobile" && mobileImage.length ? mobileImage : desktopImage;
            return backgroundImage.length ? "url(\"" + backgroundImage[0].url + "\")" : "none";
        };

        Preview.prototype.getResizeUtils = function () {
            return this.resizeUtils;
        };

        Preview.prototype.onNewColumnDrop = function (dropPosition) {
            var _this = this;
            columnFactory.createColumn(
                this.contentType,
                this.resizeUtils.getSmallestColumnWidth(),
                dropPosition.insertIndex
            ).then(function () {
                var newWidth = _this.resizeUtils.getAcceptedColumnWidth(
                    (_this.resizeUtils.getColumnWidth(dropPosition.affectedColumn) - _this.resizeUtils.getSmallestColumnWidth()).toString()
                );
                resize.updateColumnWidth(dropPosition.affectedColumn, newWidth);
            });
        };

        Preview.prototype.onExistingColumnDrop = function (movePosition) {
            var column = columnRegistry.getDragColumn();
            var sourceGroupPreview = column.parentContentType.preview;
            var modifyOldNeighbour;
            var oldWidth = sourceGroupPreview.getResizeUtils().getColumnWidth(column);

            if (resize.getAdjacentColumn(column, "+1")) {
                modifyOldNeighbour = resize.getAdjacentColumn(column, "+1");
            } else if (resize.getAdjacentColumn(column, "-1")) {
                modifyOldNeighbour = resize.getAdjacentColumn(column, "-1");
            }

            resize.updateColumnWidth(column, this.resizeUtils.getSmallestColumnWidth());
            moveContentType.moveContentType(column, movePosition.insertIndex, this.contentType);

            if (modifyOldNeighbour) {
                var oldNeighbourWidth = sourceGroupPreview.getResizeUtils().getAcceptedColumnWidth(
                    (oldWidth + sourceGroupPreview.getResizeUtils().getColumnWidth(modifyOldNeighbour)).toString()
                );
                resize.updateColumnWidth(modifyOldNeighbour, oldNeighbourWidth);
            }

            var newNeighbourWidth = this.resizeUtils.getAcceptedColumnWidth(
                (this.resizeUtils.getColumnWidth(movePosition.affectedColumn) - this.resizeUtils.getSmallestColumnWidth()).toString()
            );
            resize.updateColumnWidth(movePosition.affectedColumn, newNeighbourWidth);
        };

        Preview.prototype.onColumnSort = function (column, newIndex) {
            var currentIndex = resize.getColumnIndexInGroup(column);
            if (currentIndex !== newIndex) {
                if (currentIndex < newIndex) {
                    --newIndex;
                }
                moveContentType.moveContentType(column, newIndex);
            }
        };

        Preview.prototype.onColumnResize = function (column, width, adjustedColumn) {
            this.resizeUtils.resizeColumn(column, width, adjustedColumn);
        };

        Preview.prototype.bindInteractions = function (group) {
            this.groupElement = $(group);
            this.initDroppable(this.groupElement);
            this.initMouseMove(this.groupElement);
            $("body").mouseleave(this.endAllInteractions.bind(this));
        };

        Preview.prototype.bindDropPlaceholder = function (element) {
            this.dropPlaceholder = $(element);
        };

        Preview.prototype.bindMovePlaceholder = function (element) {
            this.movePlaceholder = $(element);
        };

        Preview.prototype.bindGhost = function (ghost) {
            this.resizeGhost = $(ghost);
        };

        Preview.prototype.registerResizeHandle = function (column, handle) {
            var _this = this;
            handle.off("mousedown touchstart");
            handle.on("mousedown touchstart", function (event) {
                event.preventDefault();
                var groupPosition = _this.getGroupPosition(_this.groupElement);
                _this.resizing(true);
                _this.resizeColumnInstance = column;
                _this.resizeColumnWidths = _this.resizeUtils.determineColumnWidths(_this.resizeColumnInstance, groupPosition);
                _this.resizeMaxGhostWidth = resize.determineMaxGhostWidth(_this.resizeColumnWidths);
                $("body").css("cursor", "col-resize");
                _this.resizeHistory = { left: [], right: [] };
                _this.resizeLastPosition = null;
                _this.resizeMouseDown = true;
                ++_this.interactionLevel;
                events.trigger("stage:interactionStart", { stageId: _this.contentType.stageId });
            });
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
                    events.trigger("stage:interactionStart", { stageId: _this.contentType.stageId });
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
                    _this.movePlaceholder.removeClass("active");
                    _this.startDragEvent = null;
                    events.trigger("banner-grid-item:dragStop", {
                        column: draggedColumn,
                        stageId: _this.contentType.stageId
                    });
                    events.trigger("stage:interactionStop", { stageId: _this.contentType.stageId });
                }
            });
        };

        Preview.prototype.updateGridSize = function () {
            var _this = this;
            if (!$.isNumeric(this.gridSizeInput())) {
                this.gridSizeError($t("Please enter a valid number."));
            }

            var newGridSize = parseInt(this.gridSizeInput().toString(), 10);
            if (newGridSize || newGridSize === 0) {
                if (newGridSize !== this.resizeUtils.getGridSize() || true) {
                    try {
                        gridSize.resizeGrid(this.contentType, newGridSize, this.gridSizeHistory);
                        this.recordGridResize(newGridSize);
                        this.gridSizeError(null);
                        this.gridChange(true);
                        _.delay(function () {
                            _this.gridChange(false);
                        }, 1000);
                    } catch (e) {
                        if (e instanceof gridSize.GridSizeError) {
                            this.gridSizeError(e.message);
                        } else {
                            throw e;
                        }
                    }
                } else {
                    this.gridSizeError(null);
                }
            }
        };

        Preview.prototype.hasColumnLine = function (contentType) {
            var children = this.contentType.getChildren()();
            var hasColumnLine = false;

            if (children.length === 0 && checkStageFullScreen(contentType.stageId)) {
                hasColumnLine = true;
            }

            children.forEach(function (child) {
                if (child.config.name === "banner-grid-line") {
                    hasColumnLine = true;
                }
            });

            return hasColumnLine;
        };

        Preview.prototype.moveContentsToNewColumnGroup = function () {
            var _this = this;
            if (this.hasColumnLine(this.contentType)) {
                return;
            }

            var indexToInsertNewColumnGroupAt = this.getCurrentIndexInParent();
            createContentType(
                Config.getContentTypeConfig("banner-grid-group"),
                this.contentType.parentContentType,
                this.contentType.stageId
            ).then(function (columnGroup) {
                _this.contentType.parentContentType.addChild(columnGroup, indexToInsertNewColumnGroupAt);
                events.trigger(columnGroup.config.name + ":dropAfter", {
                    id: columnGroup.id,
                    columnGroup: columnGroup,
                    columnGroupWithoutColumnLine: _this.contentType
                });
                _this.fireMountEvent(_this.contentType, columnGroup);
            });
        };

        Preview.prototype.getCurrentIndexInParent = function () {
            var currentIndex = 0;
            var _this = this;
            this.contentType.parentContentType.getChildren()().some(function (sibling) {
                if (sibling.id !== _this.contentType.id) {
                    currentIndex++;
                    return false;
                }
                return true;
            });
            return currentIndex;
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

        Preview.prototype.setColumnsAsResizing = function () {
            var columns = Array.prototype.slice.call(arguments);
            columns.forEach(function (column) {
                column.preview.resizing(true);
                column.preview.element.css({ transition: "width 350ms ease-in-out" });
            });
        };

        Preview.prototype.unsetResizingColumns = function () {
            this.contentType.children().forEach(function (column) {
                column.preview.resizing(false);
                if (column.preview.element) {
                    column.preview.element.css({ transition: "" });
                }
            });
        };

        Preview.prototype.endAllInteractions = function () {
            if (this.resizing() === true) {
                for (; this.interactionLevel > 0; this.interactionLevel--) {
                    events.trigger("stage:interactionStop", { stageId: this.contentType.stageId });
                }
            }

            this.resizing(false);
            this.resizeMouseDown = null;
            this.resizeLeftLastColumnShrunk = this.resizeRightLastColumnShrunk = null;
            this.dropPositions = [];
            $("body").css("cursor", "");
            this.movePlaceholder.css("left", "").removeClass("active");
            this.resizeGhost.removeClass("active");
            this.groupPositionCache = null;
        };

        Preview.prototype.initMouseMove = function (group) {
            var _this = this;
            var intersects = false;

            $(document).on("mousemove touchmove", function (event) {
                if (group.parents(sortable.hiddenClass).length > 0) {
                    return;
                }

                var groupPosition = _this.getGroupPosition(group);

                if (event.type === "touchmove") {
                    event.pageX = event.originalEvent.pageX;
                    event.pageY = event.originalEvent.pageY;
                }

                if (_this.eventIntersectsGroup(event, groupPosition)) {
                    intersects = true;
                    _this.onResizingMouseMove(event, group, groupPosition);
                } else {
                    intersects = false;
                    _this.groupPositionCache = null;
                    _this.dropPosition = null;
                    _this.movePlaceholder.css("left", "").removeClass("active");
                }
            }).on("mouseup touchend", function () {
                intersects = false;
                _this.dropPosition = null;
                _this.endAllInteractions();

                _.defer(function () {
                    group.find(".ui-sortable").each(function () {
                        if ($(this).data("ui-sortable")) {
                            $(this).sortable("option", "disabled", false);
                        }
                    });
                });
            });
        };

        Preview.prototype.handleMouseUp = function () {
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
            if (this.movePosition && column && column.parentContentType !== this.contentType) {
                this.onExistingColumnDrop(this.movePosition);
            }
        };

        Preview.prototype.eventIntersectsGroup = function (event, groupPosition) {
            return event.pageY > groupPosition.top &&
                event.pageY < groupPosition.top + groupPosition.outerHeight &&
                event.pageX > groupPosition.left &&
                event.pageX < groupPosition.left + groupPosition.outerWidth;
        };

        Preview.prototype.getGroupPosition = function (group) {
            if (!this.groupPositionCache) {
                this.groupPositionCache = {
                    top: group.offset().top,
                    left: group.offset().left,
                    width: group.width(),
                    height: group.height(),
                    outerWidth: group.outerWidth(),
                    outerHeight: group.outerHeight()
                };
            }
            return this.groupPositionCache;
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

                var result = this.resizeUtils.determineAdjustedColumn(currentPos, this.resizeColumnInstance, this.resizeHistory);
                adjustedColumn = result[0];
                modifyColumnInPair = result[1];
                usedHistory = result[2];

                var ghostWidth = this.resizeUtils.calculateGhostWidth(
                    groupPosition, currentPos, this.resizeColumnInstance, modifyColumnInPair, this.resizeMaxGhostWidth
                );
                this.resizeGhost.width(ghostWidth - 15 + "px").addClass("active");

                if (adjustedColumn && this.resizeColumnWidths) {
                    newColumnWidth = this.resizeColumnWidths.find(function (val) {
                        return resize.comparator(currentPos, val.position, 35) && val.forColumn === modifyColumnInPair;
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

        Preview.prototype.initDroppable = function (group) {
            var self = this;
            var headStyles;

            group.droppable({
                deactivate: function () {
                    self.dropOverElement = null;
                    _.defer(function () {
                        group.parents(".element-children").each(function () {
                            if ($(this).data("ui-sortable")) {
                                $(this).sortable("option", "disabled", false);
                            }
                        });
                    });
                },
                activate: function () {
                    if (dragDropRegistry.getDraggedContentTypeConfig() === Config.getContentTypeConfig("banner-grid-group")) {
                        group.find(".ui-sortable").each(function () {
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
                },
                out: function () {
                    self.dropOverElement = null;
                },
                over: function () {
                    if (dragDropRegistry.getDraggedContentTypeConfig() === Config.getContentTypeConfig("banner-grid-group")) {
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
                allowedColumnWidths.push(resize.getRoundedColumnWidth(100 / this.resizeUtils.getGridSize() * i));
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

        Preview.prototype.removeIfEmpty = function () {
            if (this.contentType.children().length === 0) {
                this.contentType.parentContentType.removeChild(this.contentType);
            }
        };

        Preview.prototype.recordGridResize = function (newGridSize) {
            // Grid size history tracking - currently a no-op
        };

        Preview.prototype.getNonEmptyColumnCount = function () {
            var nonEmptyColumnCount = 0;
            this.contentType.getChildren()().forEach(function (columnLine) {
                var numEmptyColumns = 0;
                var numCols = columnLine.getChildren()().length;
                columnLine.getChildren()().forEach(function (column) {
                    if (column.getChildren()().length === 0) {
                        numEmptyColumns++;
                    }
                });
                if (numCols - numEmptyColumns > nonEmptyColumnCount) {
                    nonEmptyColumnCount = numCols - numEmptyColumns;
                }
            });
            return nonEmptyColumnCount;
        };

        return Preview;
    }(PreviewCollection);

    return Preview;
});
