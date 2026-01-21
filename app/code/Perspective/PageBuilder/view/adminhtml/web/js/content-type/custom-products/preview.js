define([
    "jquery",
    "knockout",
    "mage/translate",
    "Magento_PageBuilder/js/events",
    "slick",
    "underscore",
    "Magento_PageBuilder/js/config",
    "Magento_PageBuilder/js/content-type-menu/hide-show-option",
    "Magento_PageBuilder/js/content-type/preview"
], function ($, ko, $t, events, slick, _, Config, HideShowOption, Preview) {
    "use strict";

    var CustomProductsPreview = function (_preview) {
        function CustomProductsPreview(contentType, config, observableUpdater) {
            var _this;

            _this = _preview.call(this, contentType, config, observableUpdater) || this;
            _this.displayPreview = ko.observable(false);
            _this.previewElement = $.Deferred();
            _this.widgetUnsanitizedHtml = ko.observable();
            _this.slidesToShow = 5;
            _this.productItemSelector = ".product-item";
            _this.centerModeClass = "center-mode";
            _this.messages = {
                EMPTY: $t("Empty Products"),
                NO_RESULTS: $t("No products were found matching your condition"),
                LOADING: $t("Loading..."),
                UNKNOWN_ERROR: $t("An unknown error occurred. Please try again.")
            };
            _this.ignoredKeysForBuild = [
                "margins_and_padding",
                "border",
                "border_color",
                "border_radius",
                "border_width",
                "css_classes",
                "text_align"
            ];
            _this.placeholderText = ko.observable(_this.messages.EMPTY);

            events.on("contentType:redrawAfter", function (args) {
                if (_this.element && _this.element.children) {
                    var $element = $(_this.element.children);

                    if (args.element && $element.closest(args.element).length) {
                        $element.slick("setPosition");
                    }
                }
            });

            events.on("stage:" + _this.contentType.stageId + ":viewportChangeAfter", function (args) {
                var viewports = Config.getConfig("viewports");

                if (_this.element && _this.appearance() === "carousel") {
                    _this.slidesToShow = parseFloat(viewports[args.viewport].options.products.default.slidesToShow);
                    _this.destroySlider();
                    _this.initSlider();
                }
            });

            return _this;
        }

        CustomProductsPreview.prototype = Object.create(_preview.prototype);
        CustomProductsPreview.prototype.constructor = CustomProductsPreview;

        /**
         * Return an array of options
         *
         * @returns {OptionsInterface}
         */
        CustomProductsPreview.prototype.retrieveOptions = function () {
            var options = _preview.prototype.retrieveOptions.call(this);

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

        /**
         * On afterRender callback.
         *
         * @param {Element} element
         */
        CustomProductsPreview.prototype.onAfterRender = function (element) {
            this.element = element;
            this.previewElement.resolve(element);
            this.initSlider();
        };

        /**
         * @inheritdoc
         */
        CustomProductsPreview.prototype.afterObservablesUpdated = function () {
            var _this = this;

            _preview.prototype.afterObservablesUpdated.call(this);

            var data = this.contentType.dataStore.getState();

            if (this.hasDataChanged(this.previousData, data)) {
                this.displayPreview(false);

                if (typeof data.conditions_encoded !== "string" || data.conditions_encoded.length === 0) {
                    this.placeholderText(this.messages.EMPTY);
                    return;
                }

                var url = Config.getConfig("preview_url");
                var requestConfig = {
                    method: "POST",
                    data: {
                        role: "products",
                        directive: this.data.main.html()
                    }
                };

                this.placeholderText(this.messages.LOADING);

                $.ajax(url, requestConfig)
                    .done(function (response) {
                        if (typeof response.data !== "object" || !Boolean(response.data.content)) {
                            _this.placeholderText(_this.messages.NO_RESULTS);
                            return;
                        }

                        if (response.data.error) {
                            _this.widgetUnsanitizedHtml(response.data.error);
                        } else {
                            _this.widgetUnsanitizedHtml(response.data.content);
                            _this.displayPreview(true);
                        }

                        _this.previewElement.done(function () {
                            $(_this.element).trigger("contentUpdated");
                        });
                    })
                    .fail(function () {
                        _this.placeholderText(_this.messages.UNKNOWN_ERROR);
                    });
            }

            this.previousData = Object.assign({}, data);
        };

        /**
         * Initialize slider
         */
        CustomProductsPreview.prototype.initSlider = function () {
            if (this.element && this.appearance() === "carousel") {
                $(this.element.children).slick(this.buildSlickConfig());
            }
        };

        /**
         * Destroy slider
         */
        CustomProductsPreview.prototype.destroySlider = function () {
            $(this.element.children).slick("unslick");
        };

        /**
         * Build the slick config object
         *
         * @returns {Object}
         */
        CustomProductsPreview.prototype.buildSlickConfig = function () {
            var attributes = this.data.main.attributes();
            var productCount = $(this.widgetUnsanitizedHtml()).find(this.productItemSelector).length;
            var viewports = Config.getConfig("viewports");
            var currentViewport = this.viewport();
            var carouselMode = attributes["data-carousel-mode"];

            var config = {
                slidesToShow: this.slidesToShow,
                slidesToScroll: this.slidesToShow,
                dots: attributes["data-show-dots"] === "true",
                arrows: attributes["data-show-arrows"] === "true",
                autoplay: attributes["data-autoplay"] === "true",
                autoplaySpeed: parseFloat(attributes["data-autoplay-speed"])
            };

            var slidesToShow = viewports[currentViewport].options.products[carouselMode]
                ? viewports[currentViewport].options.products[carouselMode].slidesToShow
                : viewports[currentViewport].options.products.default.slidesToShow;

            config.slidesToShow = parseFloat(slidesToShow);

            if (attributes["data-carousel-mode"] === "continuous" && productCount > config.slidesToShow) {
                config.centerPadding = attributes["data-center-padding"];
                config.centerMode = true;
                $(this.element).addClass(this.centerModeClass);
            } else {
                config.infinite = attributes["data-infinite-loop"] === "true";
                $(this.element).removeClass(this.centerModeClass);
            }

            return config;
        };

        /**
         * Determine if the data has changed, whilst ignoring certain keys which don't require a rebuild
         *
         * @param {Object} previousData
         * @param {Object} newData
         * @returns {boolean}
         */
        CustomProductsPreview.prototype.hasDataChanged = function (previousData, newData) {
            previousData = _.omit(previousData, this.ignoredKeysForBuild);
            newData = _.omit(newData, this.ignoredKeysForBuild);
            return !_.isEqual(previousData, newData);
        };

        return CustomProductsPreview;
    }(Preview);

    return CustomProductsPreview;
});
