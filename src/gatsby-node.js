'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const pMap = require('p-map');
const globby = require('globby');
const isTextPath = require('is-text-path');
const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);

const TRANSFORM_CONCURRENCY = 10;

const getRelativePrefix = (path) => {
    const depth = path.split('/').length - 2;
    const relativePrefix = depth > 0 ? '../'.repeat(depth) : './';

    return relativePrefix;
};

const relativizeHtmlFiles = async () => {
    // Replaces all /__GATSBY_IPFS_PATH_PREFIX__/ strings with the correct relative paths
    // based on the depth of the file within the `public/` folder
    const paths = await globby(['public/**/*.html']);

    await pMap(paths, async (path) => {
        const buffer = await readFileAsync(path);
        let contents = buffer.toString();

        // Skip if there's nothing to do
        if (!contents.includes('__GATSBY_IPFS_PATH_PREFIX__')) {
            return;
        }

        const relativePrefix = getRelativePrefix(path);

        contents = contents
        .replace(/\/__GATSBY_IPFS_PATH_PREFIX__\//g, () => relativePrefix);

        await writeFileAsync(path, contents);
    }, { concurrency: TRANSFORM_CONCURRENCY });
};

const relativizeJsFiles = async () => {
    // Replaces all "/__GATSBY_IPFS_PATH_PREFIX__" strings __GATSBY_IPFS_PATH_PREFIX__
    // Replaces all "/__GATSBY_IPFS_PATH_PREFIX__/" strings with __GATSBY_IPFS_PATH_PREFIX__ + "/"
    // Replaces all "/__GATSBY_IPFS_PATH_PREFIX__/xxxx" strings with __GATSBY_IPFS_PATH_PREFIX__ + "/xxxx"
    // Also ensures that `__GATSBY_IPFS_PATH_PREFIX__` is defined in case this JS file is outside the document context, e.g.: in a worker
    const paths = await globby(['public/**/*.js']);

    await pMap(paths, async (path) => {
        const buffer = await readFileAsync(path);
        let contents = buffer.toString();

        // Skip if there's nothing to do
        if (!contents.includes('__GATSBY_IPFS_PATH_PREFIX__')) {
            return;
        }

        // DO NOT remove the extra spaces, otherwise the code will be invalid when minified,
        // e.g.: return"__GATSBY_IPFS_PATH_PREFIX__/static/..." -> return __GATSBY_IPFS_PATH_PREFIX + "/static/..."
        contents = contents
        .replace(/["']\/__GATSBY_IPFS_PATH_PREFIX__['"]/g, () => ' __GATSBY_IPFS_PATH_PREFIX__ ')
        .replace(/(["'])\/__GATSBY_IPFS_PATH_PREFIX__\/([^'"]*?)(['"])/g, (matches, g1, g2, g3) => ` __GATSBY_IPFS_PATH_PREFIX__ + ${g1}/${g2}${g3}`);

        contents = `if(typeof __GATSBY_IPFS_PATH_PREFIX__ === 'undefined'){__GATSBY_IPFS_PATH_PREFIX__=''}${contents}`;

        await writeFileAsync(path, contents);
    }, { concurrency: TRANSFORM_CONCURRENCY });
};

const relativizeMiscAssetFiles = async () => {
    // Replaces all /__GATSBY_IPFS_PATH_PREFIX__/ strings to standard relative paths
    const paths = await globby([
        'public/**/*',
        '!public/**/*.html',
        '!public/**/*.js',
        // Page data shouldn't be relativized here because the web browser would
        // end up resolving all relative URLs in page data based on the current
        // page's URL (e.g., `/ipns/example.com/foo/bar/`) rather than the page
        // data file's location (e.g., `/ipns/example.com/page-data/xxx.json`).
        // We can't statically determine the page's URL, so there is no way to
        // correctly relativize those URLs.
        //
        // Thus, we instead let the client-side code handle
        // `__GATSBY_IPFS_PATH_PREFIX__` when it knows the actual path prefix.
        '!public/page-data/**/*.json',
    ]);

    await pMap(paths, async (path) => {
        // Skip if this is not a text file
        if (!isTextPath(path)) {
            return;
        }

        const buffer = await readFileAsync(path);
        let contents = buffer.toString();

        // Skip if there's nothing to do
        if (!contents.includes('__GATSBY_IPFS_PATH_PREFIX__')) {
            return;
        }

        const relativePrefix = getRelativePrefix(path);

        contents = contents
        .replace(/\/__GATSBY_IPFS_PATH_PREFIX__\//g, () => relativePrefix);

        await writeFileAsync(path, contents);
    }, { concurrency: TRANSFORM_CONCURRENCY });
};

const injectScriptInHtmlFiles = async () => {
    // Injects a script into the <head> of all HTML files that defines the
    // __GATSBY_IPFS_PATH_PREFIX__ variable
    const scriptBuffer = await readFileAsync(path.resolve(__dirname, 'runtime/head-script.js'));
    const scriptContents = scriptBuffer.toString();

    const paths = await globby(['public/**/*.html']);

    await pMap(paths, async (path) => {
        let contents = await readFileAsync(path);

        contents = contents
        .toString()
        .replace(/<head>/, () => `<head><script>${scriptContents}</script>`);

        await writeFileAsync(path, contents);
    }, { concurrency: TRANSFORM_CONCURRENCY });
};

exports.onPreBootstrap = ({ store, reporter }) => {
    const { config, program } = store.getState();

    if (!/\/?__GATSBY_IPFS_PATH_PREFIX__/.test(config.pathPrefix)) {
        reporter.panic('The pathPrefix must be set to __GATSBY_IPFS_PATH_PREFIX__ in your gatsby-config.js file');
    }

    if (program._[0] === 'build' && !program.prefixPaths) {
        reporter.panic('The build command must be run with --prefix-paths');
    }
};

exports.onPostBuild = async () => {
    // Relativize all occurrences of __GATSBY_IPFS_PATH_PREFIX__ within the built files
    await relativizeHtmlFiles();
    await relativizeJsFiles();
    await relativizeMiscAssetFiles();

    // Inject the runtime script into the <head> of all HTML files
    await injectScriptInHtmlFiles();
};
