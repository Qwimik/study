define([
    "Magento_PageBuilder/js/config",
    "Magento_PageBuilder/js/content-type-factory",
    "Magento_PageBuilder/js/events"
], function (Config, createContentType, events) {
    "use strict";

    /**
     * Fire mount event for content type
     *
     * @param {ContentTypeInterface} contentType
     */
    function fireMountEvent(contentType) {
        events.trigger("contentType:mountAfter", {
            id: contentType.id,
            contentType: contentType
        });
        events.trigger(contentType.config.name + ":mountAfter", {
            id: contentType.id,
            contentType: contentType
        });
    }

    /**
     * Create a banner-link inside the given column
     *
     * @param {ContentTypeCollectionInterface} column
     * @returns {Promise}
     */
    function createBannerLinkForColumn(column) {
        if (Config.getContentTypeConfig("banner-link") && column.getChildren()().length === 0) {
            return createContentType(
                Config.getContentTypeConfig("banner-link"),
                column,
                column.stageId
            ).then(function (bannerLink) {
                column.addChild(bannerLink, 0);
                fireMountEvent(bannerLink);
                return bannerLink;
            });
        }
        return Promise.resolve(null);
    }

    /**
     * Create a banner grid item and add it to its parent
     *
     * @param {ContentTypeCollectionInterface} columnGroup
     * @param {number} width
     * @param {number} index
     * @returns {Promise<ContentTypeCollectionInterface>}
     */
    function createColumn(columnGroup, width, index) {
        return createContentType(
            Config.getContentTypeConfig("banner-grid-item"),
            columnGroup,
            columnGroup.stageId,
            { width: parseFloat(width.toString()) + "%" }
        ).then(function (column) {
            columnGroup.addChild(column, index);
            // Create banner-link inside the new column
            createBannerLinkForColumn(column);
            return column;
        }).catch(function (error) {
            console.error(error);
            return null;
        });
    }

    /**
     * Create a banner grid line and add it to its parent
     *
     * @param {ContentTypeCollectionInterface} columnGroup
     * @param {number} width
     * @param {number} index
     * @returns {Promise<ContentTypeCollectionInterface>}
     */
    function createColumnLine(columnGroup, width, index) {
        return createContentType(
            Config.getContentTypeConfig("banner-grid-line"),
            columnGroup,
            columnGroup.stageId,
            { width: parseFloat(width.toString()) + "%" }
        ).then(function (columnLine) {
            columnGroup.addChild(columnLine, index);
            return columnLine;
        }).catch(function (error) {
            console.error(error);
            return null;
        });
    }

    return {
        createColumn: createColumn,
        createColumnLine: createColumnLine
    };
});
