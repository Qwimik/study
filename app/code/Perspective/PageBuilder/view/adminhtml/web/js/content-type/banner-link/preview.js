/*eslint-disable */
/* jscs:disable */

function _inheritsLoose(subClass, superClass) { subClass.prototype = Object.create(superClass.prototype); subClass.prototype.constructor = subClass; _setPrototypeOf(subClass, superClass); }

function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }

define([
    "jarallax",
    "jarallaxVideo",
    "jquery",
    "jquery/z-index",
    "mage/translate",
    "Magento_PageBuilder/js/events",
    "mageUtils",
    "underscore",
    "vimeoWrapper",
    "Magento_PageBuilder/js/content-type-menu/hide-show-option",
    "Magento_PageBuilder/js/uploader",
    "Magento_PageBuilder/js/utils/delay-until",
    "Magento_PageBuilder/js/utils/editor",
    "Magento_PageBuilder/js/utils/nesting-link-dialog",
    "Magento_PageBuilder/js/utils/nesting-widget-dialog",
    "Magento_PageBuilder/js/wysiwyg/factory",
    "Magento_PageBuilder/js/content-type/preview"
], function (
    _jarallax,
    _jarallaxVideo,
    _jquery,
    _zIndex,
    _translate,
    _events,
    _mageUtils,
    _underscore,
    _vimeoWrapper,
    _hideShowOption,
    _uploader,
    _delayUntil,
    _editor,
    _nestingLinkDialog,
    _nestingWidgetDialog,
    _factory,
    _preview
) {
    var Preview = /*#__PURE__*/function (_preview2) {
        "use strict";

        _inheritsLoose(Preview, _preview2);

        function Preview() {
            var _this;

            for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
                args[_key] = arguments[_key];
            }

            _this = _preview2.call.apply(_preview2, [this].concat(args)) || this;
            _this.buttonPlaceholder = (0, _translate)("Edit Button Text");
            _this.wysiwygDeferred = _jquery.Deferred();
            _this.handledDoubleClick = false;
            _this.videoUpdateProperties = ["background_type", "video_fallback_image", "video_lazy_load", "video_loop", "video_play_only_visible", "video_source"];
            _this.bannerOverlaySelector = ".pagebuilder-overlay";
            _this.defaultOverlayZIndex = 2;
            _this.activeEditorOverlayZIndex = 3;
            _this.buildJarallax = _underscore.debounce(function () {
                try {
                    jarallax(_this.wrapper, "destroy");
                } catch (e) {}

                if (_this.wrapper && _this.wrapper.dataset.backgroundType === "video" && _this.wrapper.dataset.videoSrc.length) {
                    _underscore.defer(function () {
                        jarallax(_this.wrapper, {
                            videoSrc: _this.wrapper.dataset.videoSrc,
                            imgSrc: _this.wrapper.dataset.videoFallbackSrc,
                            videoLoop: _this.contentType.dataStore.get("video_loop") === "true",
                            speed: 1,
                            videoPlayOnlyVisible: _this.contentType.dataStore.get("video_play_only_visible") === "true",
                            videoLazyLoading: _this.contentType.dataStore.get("video_lazy_load") === "true"
                        });

                        if (_this.wrapper.jarallax && _this.wrapper.jarallax.video) {
                            _this.wrapper.jarallax.video.on("started", function () {
                                if (_this.wrapper.jarallax && _this.wrapper.jarallax.$video) {
                                    _this.wrapper.jarallax.$video.style.visibility = "visible";
                                }
                            });
                        }
                    });
                }
            }, 50);
            return _this;
        }

        var _proto = Preview.prototype;

        /**
         * Get background image url base on the viewport.
         *
         * @returns {string}
         */
        _proto.getBackgroundImage = function getBackgroundImage() {
            var mobileImage = this.contentType.dataStore.get("mobile_image");
            var desktopImage = this.contentType.dataStore.get("background_image");
            var backgroundImage = this.viewport() === "mobile" && mobileImage.length ? mobileImage : desktopImage;
            return backgroundImage.length ? "url(\"" + backgroundImage[0].url + "\")" : "none";
        };

        /**
         * Return an array of options - WITHOUT remove option
         *
         * @returns {OptionsInterface}
         */
        _proto.retrieveOptions = function retrieveOptions() {
            var options = _preview2.prototype.retrieveOptions.call(this);

            // Remove the remove option - banner-link cannot be deleted
            delete options.remove;
            // Remove move option - banner-link should stay in place
            delete options.move;
            // Remove duplicate option
            delete options.duplicate;

            options.hideShow = new _hideShowOption({
                preview: this,
                icon: _hideShowOption.showIcon,
                title: _hideShowOption.showText,
                action: this.onOptionVisibilityToggle,
                classes: ["hide-show-content-type"],
                sort: 40
            });

            return options;
        };

        /**
         * Get registry callback reference to uploader UI component
         *
         * @returns {Uploader}
         */
        _proto.getUploader = function getUploader() {
            var initialImageValue = this.contentType.dataStore.get(this.config.additional_data.uploaderConfig.dataScope, "");
            return new _uploader("imageuploader_" + this.contentType.id, this.config.additional_data.uploaderConfig, this.contentType.id, this.contentType.dataStore, initialImageValue);
        };

        /**
         * @param {HTMLElement} element
         */
        _proto.afterRenderWysiwyg = function afterRenderWysiwyg(element) {
            var _this2 = this;

            this.element = element;
            element.id = this.contentType.id + "-editor";
            element.innerHTML = this.data.content.html();
            this.contentType.dataStore.subscribe(function () {
                if (!_this2.wysiwyg || _this2.wysiwyg && _this2.wysiwyg.getAdapter().id !== (0, _editor.getActiveEditor)().id) {
                    element.innerHTML = _this2.data.content.html();
                }
            }, "message");

            this.wysiwyg = null;
        };

        /**
         * Stop event to prevent execution of action when editing textarea.
         */
        _proto.stopEvent = function stopEvent(preview, event) {
            event.stopPropagation();
            return true;
        };

        /**
         * Init WYSIWYG on load
         */
        _proto.initWysiwyg = function initWysiwyg(element) {
            this.element = element;
            element.id = this.contentType.id + "-editor";
            this.wysiwyg = null;
            return this.initWysiwygFromClick(false);
        };

        /**
         * Init the WYSIWYG
         */
        _proto.initWysiwygFromClick = function initWysiwygFromClick(focus) {
            var _this3 = this;

            if (focus === void 0) {
                focus = false;
            }

            if (this.wysiwyg) {
                return Promise.resolve(this.wysiwyg);
            }

            var wysiwygConfig = this.config.additional_data.wysiwygConfig.wysiwygConfigData;

            if (focus) {
                wysiwygConfig.adapter.settings.auto_focus = this.element.id;

                wysiwygConfig.adapter.settings.init_instance_callback = function (editor) {
                    editor.on("focus", function () {
                        (0, _jquery)(_this3.element).parents(_this3.bannerOverlaySelector).zIndex(_this3.activeEditorOverlayZIndex);
                    });
                    editor.on("blur", function () {
                        (0, _jquery)(_this3.element).parents(_this3.bannerOverlaySelector).zIndex(_this3.defaultOverlayZIndex);
                        (0, _nestingLinkDialog)(_this3.contentType.dataStore, _this3.wysiwyg, "message", "link_url");
                        (0, _nestingWidgetDialog)(_this3.contentType.dataStore, _this3.wysiwyg, "message", "link_url");
                    });

                    _underscore.defer(function () {
                        _this3.element.blur();
                        _this3.element.focus();
                    });
                };
            }

            wysiwygConfig.adapter.settings.fixed_toolbar_container = "#" + this.contentType.id + " .pagebuilder-banner-text-content";
            return (0, _factory)(this.contentType.id, this.element.id, this.config.name, wysiwygConfig, this.contentType.dataStore, "message", this.contentType.stageId).then(function (wysiwyg) {
                _this3.wysiwyg = wysiwyg;
                return wysiwyg;
            });
        };

        /**
         * Makes WYSIWYG active
         */
        _proto.activateEditor = function activateEditor(preview, event) {
            var _this4 = this;

            if (this.element && !this.wysiwyg) {
                var bookmark = (0, _editor.createBookmark)(event);
                (0, _editor.lockImageSize)(this.element);
                this.element.removeAttribute("contenteditable");

                _underscore.defer(function () {
                    _this4.initWysiwygFromClick(true).then(function () {
                        return (0, _delayUntil)(function () {
                            _this4.handledDoubleClick = true;
                            _this4.wysiwygDeferred.resolve();
                            (0, _editor.moveToBookmark)(bookmark);
                            (0, _editor.unlockImageSize)(_this4.element);
                        }, function () {
                            return _this4.element.classList.contains("mce-edit-focus");
                        }, 10);
                    }).catch(function (error) {
                        console.error(error);
                    });
                });
            } else if (this.element && this.wysiwyg) {
                var element = this.element || this.textarea;

                if (event.currentTarget !== event.target && event.target !== element && !element.contains(event.target)) {
                    return;
                }

                element.focus();
            }
        };

        /**
         * If a user double clicks prior to initializing TinyMCE, forward the event
         */
        _proto.handleDoubleClick = function handleDoubleClick(preview, event) {
            var _this5 = this;

            if (this.handledDoubleClick) {
                return;
            }

            event.preventDefault();
            var targetIndex = (0, _editor.findNodeIndex)(this.element, event.target.tagName, event.target);
            this.handledDoubleClick = true;
            this.wysiwygDeferred.then(function () {
                var target = document.getElementById(event.target.id);

                if (!target) {
                    target = (0, _editor.getNodeByIndex)(_this5.element, event.target.tagName, targetIndex);
                }

                if (target) {
                    target.dispatchEvent((0, _editor.createDoubleClickEvent)());
                }
            });
        };

        /**
         * Set state based on overlay mouseover event for the preview
         */
        _proto.onMouseOverWrapper = function onMouseOverWrapper() {
            if (this.data.main.attributes()["data-show-overlay"] === "hover") {
                this.data.overlay.attributes(Object.assign(this.data.overlay.attributes(), {
                    "data-background-color-orig": this.data.overlay.style().backgroundColor
                }));
                this.data.overlay.style(Object.assign(this.data.overlay.style(), {
                    backgroundColor: this.data.overlay.attributes()["data-overlay-color"]
                }));
            }

            if (this.data.main.attributes()["data-show-button"] === "hover") {
                this.data.button.style(Object.assign(this.data.button.style(), {
                    opacity: 1,
                    visibility: "visible"
                }));
            }
        };

        /**
         * Set state based on overlay mouseout event for the preview
         */
        _proto.onMouseOutWrapper = function onMouseOutWrapper() {
            if (this.data.main.attributes()["data-show-overlay"] === "hover") {
                this.data.overlay.style(Object.assign(this.data.overlay.style(), {
                    backgroundColor: this.data.overlay.attributes()["data-background-color-orig"]
                }));
            }

            if (this.data.main.attributes()["data-show-button"] === "hover") {
                this.data.button.style(Object.assign(this.data.button.style(), {
                    opacity: 0,
                    visibility: "hidden"
                }));
            }
        };

        /**
         * @returns {Boolean}
         */
        _proto.isWysiwygSupported = function isWysiwygSupported() {
            return (0, _editor.isWysiwygSupported)();
        };

        /**
         * @param {HTMLTextAreaElement} element
         */
        _proto.initTextarea = function initTextarea(element) {
            var _this6 = this;

            this.textarea = element;
            this.textarea.value = this.contentType.dataStore.get("message");
            this.adjustTextareaHeightBasedOnScrollHeight();

            _events.on("form:" + this.contentType.id + ":saveAfter", function () {
                _this6.textarea.value = _this6.contentType.dataStore.get("message");
                _this6.adjustTextareaHeightBasedOnScrollHeight();
            });
        };

        /**
         * Save current value of textarea in data store
         */
        _proto.onTextareaKeyUp = function onTextareaKeyUp() {
            this.adjustTextareaHeightBasedOnScrollHeight();
            this.contentType.dataStore.set("message", this.textarea.value);
        };

        /**
         * Start stage interaction on textarea blur
         */
        _proto.onTextareaFocus = function onTextareaFocus() {
            (0, _jquery)(this.textarea).closest(".pagebuilder-banner-text-content").addClass("pagebuilder-toolbar-active");
            _events.trigger("stage:interactionStart");
        };

        /**
         * Stop stage interaction on textarea blur
         */
        _proto.onTextareaBlur = function onTextareaBlur() {
            (0, _jquery)(this.textarea).closest(".pagebuilder-banner-text-content").removeClass("pagebuilder-toolbar-active");
            _events.trigger("stage:interactionStop");
        };

        /**
         * Init the parallax element
         */
        _proto.initParallax = function initParallax(element) {
            var _this7 = this;

            this.wrapper = element;

            _underscore.defer(function () {
                _this7.buildJarallax();
            });
        };

        /**
         * Destroy jarallax instance.
         */
        _proto.destroy = function destroy() {
            _preview2.prototype.destroy.call(this);

            if (this.wrapper) {
                jarallax(this.wrapper, "destroy");
            }
        };

        /**
         * @inheritDoc
         */
        _proto.bindEvents = function bindEvents() {
            var _this8 = this;

            this.contentType.dataStore.subscribe(function (state) {
                var sanitizedContent = (0, _editor.removeReservedHtmlAttributes)(state.message);

                if (sanitizedContent !== state.message) {
                    state.message = sanitizedContent;
                }
            }, "message");

            _preview2.prototype.bindEvents.call(this);

            _events.on("banner-link:mountAfter", function (args) {
                if (args.id === _this8.contentType.id) {
                    _this8.buildJarallax();

                    _this8.isSnapshot.subscribe(function (value) {
                        _this8.changeUploaderControlsVisibility();
                    });

                    _this8.changeUploaderControlsVisibility();
                }
            });

            _events.on(this.config.name + ":" + this.contentType.id + ":updateAfter", function () {
                var dataStore = _this8.contentType.dataStore.getState();
                var imageObject = dataStore[_this8.config.additional_data.uploaderConfig.dataScope][0] || {};

                if (dataStore.message === "<div data-bind=\"html: data.content.html\">&nbsp;</div>") {
                    _this8.contentType.dataStore.set("message", "");
                }

                _events.trigger("image:" + _this8.contentType.id + ":assignAfter", imageObject);
            });

            this.contentType.dataStore.subscribe(function (data) {
                if (this.shouldUpdateVideo(data)) {
                    this.buildJarallax();
                }
            }.bind(this));

            _events.on("image:" + this.contentType.id + ":uploadAfter", function () {
                _this8.contentType.dataStore.set("background_type", "image");
            });

            _events.on("stage:" + this.contentType.stageId + ":viewportChangeAfter", function (args) {
                _this8.buildJarallax();
            });
        };

        /**
         * Change uploader controls visibility
         */
        _proto.changeUploaderControlsVisibility = function changeUploaderControlsVisibility() {
            var _this9 = this;

            this.getUploader().getUiComponent()(function (uploader) {
                uploader.visibleControls = !_this9.isSnapshot();
            });
        };

        /**
         * Adjust textarea's height based on scrollHeight
         */
        _proto.adjustTextareaHeightBasedOnScrollHeight = function adjustTextareaHeightBasedOnScrollHeight() {
            this.textarea.style.height = "";
            var scrollHeight = this.textarea.scrollHeight;
            var minHeight = parseInt((0, _jquery)(this.textarea).css("min-height"), 10);

            if (scrollHeight === minHeight) {
                return;
            }

            (0, _jquery)(this.textarea).height(scrollHeight);
        };

        /**
         * Check if video options has been updated.
         */
        _proto.shouldUpdateVideo = function shouldUpdateVideo(state) {
            var _this10 = this;

            var previousState = this.contentType.dataStore.getPreviousState();
            var diff = _mageUtils.compare(previousState, state).changes;

            if (diff.length > 0) {
                return _underscore.some(diff, function (element) {
                    if (element.name === "video_fallback_image") {
                        return (!_underscore.isEmpty(previousState.video_fallback_image) && previousState.video_fallback_image) !== (!_underscore.isEmpty(state.video_fallback_image) && state.video_fallback_image);
                    }

                    return _this10.videoUpdateProperties.indexOf(element.name) !== -1;
                });
            }
        };

        return Preview;
    }(_preview);

    return Preview;
});
