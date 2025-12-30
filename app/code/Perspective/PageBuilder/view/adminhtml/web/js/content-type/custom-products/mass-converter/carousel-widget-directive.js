define([
    "Magento_PageBuilder/js/mass-converter/widget-directive-abstract",
    "Magento_PageBuilder/js/utils/object"
], function (WidgetDirectiveAbstract, object) {
    "use strict";

    var WidgetDirective = function (_widgetDirectiveAbstract) {
        function WidgetDirective() {
            return _widgetDirectiveAbstract.apply(this, arguments) || this;
        }

        WidgetDirective.prototype = Object.create(_widgetDirectiveAbstract.prototype);
        WidgetDirective.prototype.constructor = WidgetDirective;

        /**
         * Convert value to internal format
         *
         * @param {object} data
         * @param {object} config
         * @returns {object}
         */
        WidgetDirective.prototype.fromDom = function (data, config) {
            var attributes = _widgetDirectiveAbstract.prototype.fromDom.call(this, data, config);

            data.carousel_products_count = attributes.products_count;
            data.sort_order = attributes.sort_order;
            data.condition_option = attributes.condition_option || "condition";
            data[data.condition_option] = this.decodeWysiwygCharacters(
                this.decodeHtmlCharacters(attributes.condition_option_value || "")
            );
            data.conditions_encoded = this.decodeWysiwygCharacters(attributes.conditions_encoded || "");
            data[data.condition_option + "_source"] = data.conditions_encoded;

            return data;
        };

        /**
         * Convert value to knockout format
         *
         * @param {object} data
         * @param {object} config
         * @returns {object}
         */
        WidgetDirective.prototype.toDom = function (data, config) {
            var attributes = {
                type: "Magento\\CatalogWidget\\Block\\Product\\ProductsList",
                template: "Magento_PageBuilder::catalog/product/widget/content/carousel.phtml",
                anchor_text: "",
                id_path: "",
                show_pager: 0,
                products_count: data.carousel_products_count,
                condition_option: data.condition_option,
                condition_option_value: "",
                type_name: "Catalog Products Carousel",
                conditions_encoded: this.encodeWysiwygCharacters(data.conditions_encoded || "")
            };

            if (data.sort_order) {
                attributes.sort_order = data.sort_order;
            }

            if (typeof data[data.condition_option] === "string") {
                attributes.condition_option_value = this.encodeWysiwygCharacters(data[data.condition_option]);
            }

            if (attributes.conditions_encoded.length === 0) {
                return data;
            }

            object.set(data, config.html_variable, this.buildDirective(attributes));
            return data;
        };

        /**
         * @param {string} content
         * @returns {string}
         */
        WidgetDirective.prototype.encodeWysiwygCharacters = function (content) {
            return content
                .replace(/\{/g, "^[")
                .replace(/\}/g, "^]")
                .replace(/"/g, "`")
                .replace(/\\/g, "|")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
        };

        /**
         * @param {string} content
         * @returns {string}
         */
        WidgetDirective.prototype.decodeWysiwygCharacters = function (content) {
            return content
                .replace(/\^\[/g, "{")
                .replace(/\^\]/g, "}")
                .replace(/`/g, "\"")
                .replace(/\|/g, "\\")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">");
        };

        /**
         * Decode html special characters
         *
         * @param {string} content
         * @returns {string}
         */
        WidgetDirective.prototype.decodeHtmlCharacters = function (content) {
            if (content) {
                var htmlDocument = new DOMParser().parseFromString(content, "text/html");
                return htmlDocument.body ? htmlDocument.body.textContent : content;
            }
            return content;
        };

        return WidgetDirective;
    }(WidgetDirectiveAbstract);

    return WidgetDirective;
});
