define([
    "jquery",
    "knockout",
    "mage/translate",
    "Magento_PageBuilder/js/events",
    "Magento_Ui/js/modal/alert",
    "Magento_PageBuilder/js/config",
    "Magento_PageBuilder/js/content-type-factory",
    "Magento_PageBuilder/js/content-type-menu/option",
    "Perspective_PageBuilder/js/content-type/banner-grid-group/grid-size",
    "Perspective_PageBuilder/js/content-type/banner-grid-line/preview",
    "Magento_PageBuilder/js/content-type/preview-collection",
    "Magento_PageBuilder/js/content-type/column/resize"
], function (
    $,
    ko,
    $t,
    events,
    alert,
    Config,
    createContentType,
    Option,
    gridSize,
    LinePreview,
    PreviewCollection,
    resize
) {
    "use strict";

    var Preview = function (_previewCollection) {
        function Preview(contentType, config, observableUpdater) {
            var _this;

            _this = _previewCollection.call(this, contentType, config, observableUpdater) || this;
            _this.resizing = ko.observable(false);
            _this.fieldsToIgnoreOnRemove = ["width"];

            _this.contentType.dataStore.subscribe(
                _this.updateColumnWidthClass.bind(_this),
                "width"
            );
            _this.contentType.dataStore.subscribe(
                _this.updateDisplayLabel.bind(_this),
                "width"
            );
            _this.contentType.dataStore.subscribe(
                _this.triggerChildren.bind(_this),
                "width"
            );

            _this.contentType.parentContentType.dataStore.subscribe(
                _this.updateDisplayLabel.bind(_this),
                "grid_size"
            );

            _this.contentType.parentContentType.children.subscribe(
                _this.updateDisplayLabel.bind(_this)
            );

            return _this;
        }

        Preview.prototype = Object.create(_previewCollection.prototype);
        Preview.prototype.constructor = Preview;

        Preview.prototype.getBackgroundImage = function () {
            var mobileImage = this.contentType.dataStore.get("mobile_image");
            var desktopImage = this.contentType.dataStore.get("background_image");
            var backgroundImage = this.viewport() === "mobile" && mobileImage.length ?
                mobileImage : desktopImage;
            return backgroundImage.length ? "url(\"" + backgroundImage[0].url + "\")" : "none";
        };

        Preview.prototype.bindEvents = function () {
            var _this = this;
            _previewCollection.prototype.bindEvents.call(this);

            events.on("banner-grid-item:moveAfter", function (args) {
                if (args.contentType.id === _this.contentType.id) {
                    _this.updateDisplayLabel();
                }
                _this.resetRemoveOnLastColumn(args.targetParent);
                _this.resetRemoveOnLastColumn(args.sourceParent);
            });

            events.on("banner-grid-item:initializeAfter", function (args) {
                _this.resetRemoveOnLastColumn(args.columnLine);
            });

            events.on("banner-grid-item:dropAfter", function (args) {
                _this.resetRemoveOnLastColumn(_this.contentType.parentContentType);
            });

            events.on("banner-grid-item:duplicateAfter", function (args) {
                _this.resetRemoveOnLastColumn(args.duplicateContentType.parentContentType);
            });

            events.on("banner-grid-item:removeAfter", function (args) {
                if (args.contentType.id === _this.contentType.id) {
                    _this.resetRemoveOnLastColumn(args.parentContentType);
                }
            });
        };

        Preview.prototype.initColumn = function (element) {
            this.element = $(element);
            this.updateColumnWidthClass();

            events.trigger("banner-grid-item:initializeAfter", {
                column: this.contentType,
                element: $(element),
                columnLine: this.contentType.parentContentType,
                columnGroup: this.contentType.parentContentType.parentContentType
            });

            this.updateDisplayLabel();
        };

        /**
         * Add default banner-link child when column is dropped
         */
        Preview.prototype.addDefaultBannerLink = function () {
            var _this = this;

            // Only add banner-link if the column has no children
            if (this.contentType.getChildren()().length === 0) {
                createContentType(
                    Config.getContentTypeConfig("banner-link"),
                    this.contentType,
                    this.contentType.stageId
                ).then(function (bannerLink) {
                    _this.contentType.addChild(bannerLink, 0);
                    _this.fireMountEvent(bannerLink);
                });
            }
        };

        Preview.prototype.retrieveOptions = function () {
            var options = _previewCollection.prototype.retrieveOptions.call(this);
            options.move = new Option({
                preview: this,
                icon: "<i class='icon-admin-pagebuilder-handle'></i>",
                title: $t("Move"),
                classes: ["move-column"],
                sort: 10
            });
            return options;
        };

        Preview.prototype.bindResizeHandle = function (handle) {
            events.trigger("banner-grid-item:resizeHandleBindAfter", {
                column: this.contentType,
                handle: $(handle),
                columnLine: this.contentType.parentContentType
            });
        };

        Preview.prototype.createColumnGroup = function () {
            var _this = this;

            if (this.contentType.parentContentType.config.name !== "banner-grid-group") {
                var index = this.contentType.parentContentType.children().indexOf(this.contentType);
                this.contentType.parentContentType.removeChild(this.contentType);

                var defaultGridSize = gridSize.getDefaultGridSize();
                return createContentType(
                    Config.getContentTypeConfig("banner-grid-group"),
                    this.contentType.parentContentType,
                    this.contentType.stageId,
                    { grid_size: defaultGridSize }
                ).then(function (columnGroup) {
                    var col1Width = (Math.ceil(defaultGridSize / 2) * 100 / defaultGridSize).toFixed(
                        Math.round(100 / defaultGridSize) !== 100 / defaultGridSize ? 8 : 0
                    );

                    return Promise.all([
                        createContentType(
                            _this.contentType.config,
                            columnGroup,
                            columnGroup.stageId,
                            { width: col1Width + "%" }
                        ),
                        createContentType(
                            _this.contentType.config,
                            columnGroup,
                            columnGroup.stageId,
                            { width: (100 - parseFloat(col1Width)) + "%" }
                        )
                    ]).then(function (columns) {
                        columnGroup.addChild(columns[0], 0);
                        columnGroup.addChild(columns[1], 1);
                        _this.contentType.parentContentType.addChild(columnGroup, index);
                        _this.fireMountEvent(columnGroup, columns[0], columns[1]);
                        return columnGroup;
                    });
                });
            }
        };

        Preview.prototype.clone = function (contentType, autoAppend) {
            var _this = this;

            if (autoAppend === void 0) {
                autoAppend = true;
            }

            var resizeUtils = this.contentType.parentContentType.preview.getResizeUtils();

            if (contentType.config.name !== "banner-grid-item" ||
                this.contentType.parentContentType.children().length === 0 ||
                (this.contentType.parentContentType.children().length > 0 &&
                    resizeUtils.getColumnsWidth() < 100)) {
                return _previewCollection.prototype.clone.call(this, contentType, autoAppend);
            }

            var biggestShrinkableColumn = resizeUtils.findBiggerShrinkableColumn(contentType);

            if (biggestShrinkableColumn) {
                var shrinkableClone = _previewCollection.prototype.clone.call(this, contentType, autoAppend);

                if (shrinkableClone) {
                    var newShrinkableColumnWidth = resizeUtils.getColumnWidth(biggestShrinkableColumn) -
                        resizeUtils.getColumnWidth(contentType);
                    var duplicateColumnWidth = resizeUtils.getColumnWidth(contentType);

                    shrinkableClone.then(function (duplicateContentType) {
                        resize.updateColumnWidth(
                            biggestShrinkableColumn,
                            resizeUtils.getAcceptedColumnWidth(newShrinkableColumnWidth.toString())
                        );
                        resize.updateColumnWidth(duplicateContentType, duplicateColumnWidth);
                        return duplicateContentType;
                    });
                }
                return;
            }

            var splitTimes = Math.round(
                resizeUtils.getColumnWidth(contentType) / resizeUtils.getSmallestColumnWidth()
            );

            if (splitTimes > 1) {
                var splitClone = _previewCollection.prototype.clone.call(this, contentType, autoAppend);

                if (splitClone) {
                    splitClone.then(function (duplicateContentType) {
                        var originalWidth = (Math.floor(splitTimes / 2) + splitTimes % 2) *
                            resizeUtils.getSmallestColumnWidth();
                        var duplicateWidth = Math.floor(splitTimes / 2) *
                            resizeUtils.getSmallestColumnWidth();

                        resize.updateColumnWidth(
                            contentType,
                            resizeUtils.getAcceptedColumnWidth(originalWidth.toString())
                        );
                        resize.updateColumnWidth(
                            duplicateContentType,
                            resizeUtils.getAcceptedColumnWidth(duplicateWidth.toString())
                        );
                        return duplicateContentType;
                    });
                }
            } else {
                var shrinkableColumn = resizeUtils.findShrinkableColumn(contentType);

                if (shrinkableColumn) {
                    var _shrinkableClone = _previewCollection.prototype.clone.call(this, contentType, autoAppend);

                    if (_shrinkableClone) {
                        _shrinkableClone.then(function (duplicateContentType) {
                            resize.updateColumnWidth(
                                shrinkableColumn,
                                resizeUtils.getAcceptedColumnWidth(
                                    (resizeUtils.getColumnWidth(shrinkableColumn) -
                                        resizeUtils.getSmallestColumnWidth()).toString()
                                )
                            );
                            resize.updateColumnWidth(
                                duplicateContentType,
                                resizeUtils.getSmallestColumnWidth()
                            );
                            return duplicateContentType;
                        });
                    }
                } else {
                    alert({
                        content: $t("There is no free space within the banner grid group to perform this action."),
                        title: $t("Unable to duplicate banner grid item")
                    });
                }
            }
        };

        Preview.prototype.updateDisplayLabel = function () {
            if (this.contentType.parentContentType.preview instanceof LinePreview) {
                var newWidth = parseFloat(this.contentType.dataStore.get("width").toString());
                var grandParent = this.contentType.parentContentType.parentContentType;
                var columnGroupPreview = grandParent.preview;
                var gridSizeVal = columnGroupPreview.gridSize();
                var newLabel = Math.round(newWidth / (100 / gridSizeVal)) + "/" + gridSizeVal;
                var columnIndex = this.contentType.parentContentType.children().indexOf(this.contentType);
                var columnNumber = columnIndex !== -1 ? columnIndex + 1 + " " : "";
                this.displayLabel($t("Banner Grid Item") + " " + columnNumber + "(" + newLabel + ")");
            }
        };

        Preview.prototype.resetRemoveOnLastColumn = function (parentContentType) {
            if (!parentContentType) {
                return;
            }

            if (parentContentType.config.name !== "banner-grid-line") {
                return;
            }

            var siblings = parentContentType.children();
            var siblingColumnLines = parentContentType.parentContentType.children();
            var totalColumnCount = 0;

            siblingColumnLines.forEach(function (columnLine) {
                var columns = columnLine.children();
                columns.forEach(function (column) {
                    totalColumnCount++;
                });
            });

            var isRemoveDisabled = totalColumnCount <= 1;

            siblingColumnLines.forEach(function (columnLine) {
                var columns = columnLine.children();
                columns.forEach(function (column) {
                    var removeOption = column.preview.getOptions().getOption("remove");
                    removeOption.isDisabled(isRemoveDisabled);
                });
            });
        };

        Preview.prototype.updateColumnWidthClass = function () {
            if (!this.element) {
                return;
            }

            var currentClass = this.element.attr("class").match(/(?:^|\s)(column-width-\d{1,3})(?:$|\s)/);

            if (currentClass !== null) {
                this.element.removeClass(currentClass[1]);
            }

            var roundedWidth = Math.ceil(
                parseFloat(this.contentType.dataStore.get("width").toString()) / 10
            ) * 10;
            this.element.addClass("column-width-" + roundedWidth);
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

        Preview.prototype.triggerChildren = function () {
            if (this.contentType.parentContentType.preview instanceof LinePreview) {
                var newWidth = parseFloat(this.contentType.dataStore.get("width").toString());
                this.delegate("trigger", "columnWidthChangeAfter", { width: newWidth });
            }
        };

        return Preview;
    }(PreviewCollection);

    return Preview;
});
