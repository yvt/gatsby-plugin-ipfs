/** Dynamically determined path prefix, or `null` */
const pathPrefix = (typeof window !== 'undefined' || null) &&
    (window.__GATSBY_IPFS_PATH_PREFIX__ || '');

/**
 * Replaces all occurrences of `__GATSBY_IPFS_PATH_PREFIX__` in a given object
 * with an actual (dynamically determined) path prefix.
 *
 * This function is intended to be used for page data, for which the patching
 * process of `gatsby-plugin-ipfs` cannot determine base URLs in a reliable way.
 *
 * This function performs a deep copy of `obj` and makes modifications to the
 * newly created object.
 *
 * This function is no-op during server-side rendering. In this case, it returns
 * `obj` as it is.
 *
 * @param {Object|String|Array} obj - The object (usually containing page data)
 *        to fix.
 * @returns {Object|String|Array} Returns a modified version of `obj`, which
 *         might be strictly identical to `obj` if no modifications were made.
 */
export function substitutePathPrefixPlaceholders(obj) {
    if (pathPrefix == null) {
        return obj;
    }

    if (typeof obj === 'string') {
        // Just like `relativizeHtmlFiles`
        return obj.replace(/\/__GATSBY_IPFS_PATH_PREFIX__\//g, () => pathPrefix);
    } else if (typeof obj === 'object') {
        if (Array.isArray(obj)) {
            return obj.map(substitutePathPrefixPlaceholders);
        }
        const result = {};

        for (const key of Object.keys(obj)) {
            result[key] = substitutePathPrefixPlaceholders(obj[key]);
        }

        return result;
    }

    return obj;
}
