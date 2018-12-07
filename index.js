"use strict";

var _fs = require('fs-extra'),
    _path = require('path'),
    _front = require('frontmatter'),
    _ejs = require('ejs'),
    _less = require('less'),
    _marked = require('showdown'),
    _moment = require('moment'),
    _glob = require('glob-promise'),
    _crypto = require('crypto'),
    _helper = require('./helper'),
    _tags = require('./tags'),
    cwd = cwd || process.cwd();

switch (process.argv[2]) {
    //initialize a folder
    case 'hello': console.log(cwd); break;
    case 'init': initFolder(_path.resolve(cwd, process.argv[3])); break;
    case 'gen': genFolder(process.argv[3] || cwd); break;
    case 'new': newDraft(process.argv); break;
    case 'publish': publish(_path.resolve(cwd, process.argv[3]), process.argv[4]); break;
    case 'slug': renameSlug(process.argv[3], process.argv[4], process.argv[5]); break;
    case '--help': case undefined:
        status('Commands:');
        status(' octa init <name>\t\t\tCreate a new website');
        status(' octa new [draft|post] <title>\t\tCreate a new article either draft or post. Defaults to draft.');
        status(' octa gen\t\t\t\tGenerate static files for the website');
        status(' octa publish <filename>\t\tPublish a draft');
        break;
    default: if (process.argv[2] !== '--color') { console.error('No such command: ' + process.argv[2]); } break;
}

// Dependencies:
// If templates has changed, we need to generate all
// If content has changed we only need to generate content
function genFolder(folder, config) {
    var draft_mode = process.argv.indexOf('--draft') > -1 || (config || {}).draft,
        site = {
            tags: [],
            posts: {},
            name: folder //save the site name
        };

    return Promise.all([
        _fs.readJSON(_path.join(__dirname, '_config.json')), //octa config
        _fs.readJSON(_path.join(folder, '_config.json')) //folder config
    ]).then(function (configs) {
        var tasks = [];

        config = Object.assign(configs[0], configs[1], config || {}); //folder config has precedence over octa config

        //we need to use absolute paths
        config.output = _path.resolve(cwd, config.output);

        //sync the js folder
        tasks.push(syncDir(_path.join(folder, '/js'), _path.join(config.output, 'js')));

        //sync the image folder
        tasks.push(syncDir(_path.join(folder, '/images'), _path.join(config.output, 'images')));

        //generate the css
        tasks.push(genLess(folder, config));

        //get drafts but only if in draft mode
        if (draft_mode) { tasks.push(getPosts(folder, config, site, '_drafts')); }

        //get posts
        tasks.push(getPosts(folder, config, site, '_posts'));

        return Promise.all(tasks).then(function () {
            var tasks = [];

            //before we render, we need to sort all the post by date, we only need to sort the key
            site.sorted = Object.keys(site.posts).sort(function (slug_a, slug_b) {
                var date_a = _moment(site.posts[slug_a].date),
                    date_b = _moment(site.posts[slug_b].date);

                return date_b.diff(date_a);
            });

            //Generate the index
            // tasks.push(genIndex(folder, config, site));

            //Generate the tags
            tasks.push(genTags(folder, config, site));

            // //Run json plugins
            tasks.push(runJSON(folder, config, site));

            //sort nav before render
            tasks.push(sortNav(folder, config, site).then(function () {
                var tasks = [];

                //Generate the index
                tasks.push(genIndex(folder, config, site));

                //for each of the post, we now need to render
                Object.keys(site.posts).forEach(function (slug) { tasks.push(site.posts[slug].render(site, config)); });

                return Promise.all(tasks);
            }));

            return Promise.all(tasks).then(function () {
                //sync main folder can only be done after after json plugins because we need to identify which files we need to filter out
                //sync the theme root folder, do not recurse into sub folders, need to take care of if config does not have filters
                return syncDir(_path.join(folder, '/'), config.output, false, (config.filters || {}).root || []).then(function () {
                    //run plugins if any
                    return runPlugins(site, config).then(function () {
                        return cleanUp(config);
                    });
                });
            });
        });
    }).catch(function (error) {
        console.error('Not in an Octa directory.');
    });

    function runPlugins(site, config) {
        //is there a plugins folder?
        return _fs.pathExists(_path.join(cwd, '_plugins')).then(function (exists) {
            if (exists) {
                return _glob(_path.join(cwd, '_plugins', '*.js')).then(function (files) {
                    var tasks = [];

                    files.forEach(function (file) {
                        var plugin = require(file);

                        tasks.push(plugin.site(site, config));
                    });

                    return Promise.all(tasks);
                });
            }
        });
    }

    function runJSON(folder, config, site) {
        return _glob(_path.join(folder, '_theme', 'json/*.ejs')).then(function (files) {
            var tasks = [];

            files.forEach(function (file) {
                var name = _path.basename(file).replace(_path.extname(file), '.json');

                config.filters = config.filters || {};
                config.filters.root = config.filters.root || [];
                config.filters.root.push(name);

                tasks.push(_ejs.renderFile(file, {config: config, site: site, helper: _helper}).then(function (str) {
                    return syncFile(str, _path.join(config.output, name));
                }));
            });

            return Promise.all(tasks);
        });
    }

    function cleanUp(config) {
        var tasks = [],
            allowed = {
                years: [],
                months: {},
                days: {},
                slugs: {}
            };

        //after generation we need to clean up the target folders. This may be because we may have a draft that generates
        //at a month folder, but now that has changed, so we need to remove them

        //get all tags folder and if a tag does not exist on our current site we remove it
        tasks.push(_glob(_path.join(config.output, 'tags/*')).then(function (dirs) {
            var tags = site.tags.map(function (tag) { return _helper.slugify(tag); }),
                tasks = [];

            dirs.forEach(function (dir) {
                if (tags.indexOf(_path.basename(dir)) === -1) { tasks.push(_fs.remove(dir)); }
            });

            return Promise.all(tasks);
        }));

        if (config.no_date) {
            tasks.push(checkSlugFolders(site.sorted));
        }
        else {
            //from all the post we have, we get the possible years, month, and date and also the slugs
            site.sorted.forEach(function (slug) {
                var post = site.posts[slug];

                if (allowed.years.indexOf(post.year) === -1) {
                    allowed.years.push(post.year);
                    allowed.months[post.year] = [];
                    allowed.days[post.year] = {};
                    allowed.slugs[post.year] = {};
                }
                if (allowed.months[post.year].indexOf(post.month) === -1) {
                    allowed.months[post.year].push(post.month);
                    allowed.days[post.year][post.month] = [];
                    allowed.slugs[post.year][post.month] = {};
                }
                if (allowed.days[post.year][post.month].indexOf(post.day) === -1) {
                    allowed.days[post.year][post.month].push(post.day);
                    allowed.slugs[post.year][post.month][post.day] = [];
                }
                if (allowed.slugs[post.year][post.month][post.day].indexOf(post.slug) === -1) {
                    allowed.slugs[post.year][post.month][post.day].push(post.slug);
                }
            });

            //check years
            tasks.push(checkDateFolders(config.output, '????', allowed.years));
            //for each year, check the months
            allowed.years.forEach(function (year) {
                tasks.push(checkDateFolders(_path.join(config.output, year), '??', allowed.months[year]));
                //for each month, check the days
                allowed.months[year].forEach(function (month) {
                    tasks.push(checkDateFolders(_path.join(config.output, year, month), '??', allowed.days[year][month]));
                    //for each day, check the slugs
                    allowed.days[year][month].forEach(function (day) {
                        tasks.push(checkDateFolders(_path.join(config.output, year, month, day), '*', allowed.slugs[year][month][day]));
                    });
                });
            });
        }

        return Promise.all(tasks);

        function checkSlugFolders(sorted) {
            var allowed = ['tags', 'css', 'js', 'images'].concat(sorted);

            return _glob(_path.join(config.output + '/*/')).then(function (dirs) {
                var tasks = [];

                dirs.forEach(function (dir) {
                    if (allowed.indexOf(_path.basename(dir)) === -1) {
                        tasks.push(_fs.remove(dir));
                        status('Cleanup: ' + dir);
                    }
                });

                return Promise.all(tasks);
            });
        }

        function checkDateFolders(path, pattern, allowed) {
            return _glob(_path.join(path, pattern)).then(function (dirs) {
                var tasks = [];

                dirs.forEach(function (dir) {
                    //the dir must be a number or if pattern for slugs no need number
                    if (pattern === '*' || isNaN(Number(_path.basename(dir))) === false) {
                        if (allowed.indexOf(_path.basename(dir)) === -1) {
                            tasks.push(_fs.remove(dir));
                            status('Cleanup: ' + dir);
                        }
                    }
                });

                return Promise.all(tasks);
            });
        }
    }

    function genTags(folder, config, site) {
        var path = _path.join(folder, '/_theme/_tags.ejs');

        //use site/_theme/tags.ejs if exist, otherwise use octa/_theme/tags.ejs
        return _fs.pathExists(path).then(function (exists) {
            var tasks = [];

            if (!exists) { path = _path.join(cwd, '/_theme/_tags.ejs'); }

            site.tags.forEach(function (tag) {
                tasks.push(_ejs.renderFile(path, {
                    data: {is_tag: true, is_home: false, tag: tag},
                    config: config,
                    helper: _helper,
                    site: site
                }).then(function (str) {
                    return _fs.ensureDir(_path.join(folder, 'tags/' + _helper.slugify(tag))).then(function () {
                        //write to local tag tmp directory
                        return _fs.writeFile(_path.join(folder, 'tags/' + _helper.slugify(tag) + '/index.' + config.extension), str);
                    });
                }));
            });

            return Promise.all(tasks).then(function () {
                //sync the entire folder
                return syncDir(_path.join(folder, 'tags'), _path.join(config.output, 'tags')).then(function () {
                    //remove the tmp folder
                    return _fs.remove(_path.join(folder, 'tags'));
                });
            });
        });
    }

    function genIndex(folder, config, site) {
        //If there is an index.ejs at the site/_theme folder we use it, otherwise we use the octa/_theme index.ejs
        var path = _path.join(folder, '/_theme/_index.ejs');

        return _fs.pathExists(path).then(function (exists) {
            if (!exists) { path = _path.join(cwd, '/_theme/_index.ejs')}

            return _ejs.renderFile(path, {config: config, site: site, helper: _helper}).then(function (str) {
                return syncFile(str, _path.join(config.output, 'index.' + config.extension));
            });
        });
    }

    function sortNav(folder, config, site) {
        var nav = [];
        //After getting all the posts, we need to sort the slug headers for nav

        //Does the file exist
        return _fs.pathExists(_path.join(folder, '_nav.json')).then(function (exists) {
            //Read the current nav
            if (exists) { return _fs.readJSON(_path.join(folder, '_nav.json')).then(function (nav) { return sortNav(nav); }) }
            else { return sortNav(nav); }
        });

        //For slugs that does not we just append
        function sortNav(nav) {
            //For current nav with slugs that is no longer in site.posts, we need to remove it
            nav.forEach(function (slug, index) {
                if (site.posts[slug] === undefined) { nav.splice(index, 1); }
            });

            //For slugs that exist in current nav, we no longer need sorting as we will follow current nav
            //Otherwise we just need to append in nav
            Object.keys(site.posts).forEach(function (slug) {
                if (nav.indexOf(slug) === -1) { nav.push(slug); }
            });

            site.nav = nav;

            return syncFile(JSON.stringify(nav, null, 4), _path.join(folder, '_nav.json'));
        }
    }

    function getPosts(folder, config, site, mode) {
        //read all the folders
        return _fs.readdir(_path.join(folder, mode)).then(function (files) {
            var tasks = [];

            files.forEach(function (file) {
                //filter and process only folders
                tasks.push(_fs.stat(_path.join(folder, mode, file)).then(function (stats) {
                    var post;

                    if (stats.isDirectory()) {
                        post = new Post(folder, mode, file, config);

                        //initialize and read data, save the post
                        return post.init(site).then(function () {
                            site.posts[post.slug] = post;

                            //save the tags
                            if (post.tags) {
                                post.tags.forEach(function (tag) {
                                    if (site.tags.indexOf(tag) === - 1) { site.tags.push(tag); }
                                });
                            }
                        });
                    }
                }));
            });

            return Promise.all(tasks);
        });
    }

    function genLess(folder, config) {
        var less_folder = '/less';

        //grab all the less files
        return _glob(_path.join(folder, less_folder, '*.less')).then(function (files) {
            var tasks = [];

            files.forEach(function (file) {
                //read the string
                tasks.push(_fs.readFile(file, 'utf8').then(function (str) {
                    //we need to pass filename so that relative paths is obtain for proper imports
                    return _less.render(str, {filename: file}).then(function (result) {
                        //write the css file
                        return syncFile(result.css, _path.join(config.output, '/css', _path.basename(file).replace('.less', '.css')));
                    });
                }));
            });

            return Promise.all(tasks);
        });
    }
}

function Post(folder, mode, file, config) {
    this.slug = _path.basename(file);

    this.path = folder + '/' + mode + '/' + this.slug;

    this.folder = folder;

    this.config = config;
}

Post.prototype = new function () {
    this.render = function (site, config) {
        var post = this;

        return Promise.all([
            //sync all assets to destination, need not be async
            syncDir(post.path, post.output, false, (config.filters || {}).asset || []),
            renderPost(post, site)
        ]);

        //Dependencies: We cannot decide if we need to render based on whether a post has been modified, because
        //the target may not be there, a template may have changed, or the target is modified. We therefore have
        //to render irrespective, and use syncDir so that we only copy over only when needed.
        function renderPost(post, site) {
            //take the tags plugin, filter off properties that is not functions, then return an array of functions because showdown needs an array
            var converter = new _marked.Converter({tables: true, extensions: Object.keys(_tags).filter(function (key) {
                        var black_list = ['post', 'site'];

                        return black_list.indexOf(key) === -1;
                    }).map(function (key) {
                        return _tags[key];
                    })}),
                path;

            //before we convert markdown, we need to init our extensions to the current post
            _tags.post = post;
            _tags.site = site;

            post.body = post.content;

            //before templating, we need to convert the body into html
            post.body = converter.makeHtml(post.body);

            //check tags to ensure got plugins
            getTags(post.body).forEach(function (tag) {
                //if a tag do not have plugin we notify
                if (_tags[tag.name] === undefined) {
                    console.error('Tag plugin not found: ' + tag.name + ' ' + post.slug);
                }
            });

            post.is_post = true;
            post.is_home = false;

            getRelated(site, post);

            //Convert markdown to html
            path = _path.join(post.folder, '/_theme/_post.ejs');

            //if there is a _post.ejs in site/_theme we use it, otherwise we default to octa/_theme/_post.ejs
            return _fs.pathExists(path).then(function (exists) {
                if (!exists) { path = _path.join(cwd, '/_theme/_post.ejs'); }

                return _ejs.renderFile(path, {data: post, site: site, helper: _helper})
                    .then(function (str) { return syncFile(str, _path.join(post.output, 'index.' + config.extension)); });
            });

            function getTags(content) {
                var str = content,
                    close_regex = /\{% (\w+)(.*?)%\}\n(.*?)\n\{% end\1 %\}\n/gs,
                    tag_regex =  /(?:<p>)?\{% (\w+) (.*?)%\}(?:<p>)?/g,
                    tags = [],
                    matches;

                //for closing tags, we get the content
                while (matches = close_regex.exec(content)) {
                    tags.push({name: matches[1]});

                    //tags.push({name: matches[1], content: matches[3], args: getArgs(matches[2]), body: matches[0]});

                    str = str.replace(matches[0], '');
                }

                //for non closing tags, we do not care about content
                while (matches = tag_regex.exec(str)) {
                    tags.push({name: matches[1]});
                    //tags.push({name: matches[1], args: getArgs(matches[2]), body: matches[0]});
                }

                return tags;
            }

            function getRelated(site, post) {
                var i = 0;

                post.related = [];

                //for each of the sorted post, find if they contain any tags in the current post
                for (; i < site.sorted.length; i++) {
                    //do not check own self
                    if (post.slug !== site.posts[site.sorted[i]].slug && exist(post.tags, site.posts[site.sorted[i]].tags)) {
                        post.related.push(site.posts[site.sorted[i]]);
                        if (post.related.length >= 3) { break; }
                    }
                }

                //if after finding all the tags, and related is still not length === 3, we insert the latest post
                if (post.related.length < 3) {
                    i = 0;
                    do {
                        if (post.slug !== site.posts[site.sorted[i]].slug) {
                            post.related.push(site.posts[site.sorted[i]]);
                        }
                        i++;
                    } while (post.related.length < 3 && i < site.sorted.length);
                }

                function exist(needles, haystack) {
                    return (needles || []).some(function (needle) { return (haystack || []).indexOf(needle) >= 0; });
                }
            }
        }
    };

    this.init = function (site) {
        var post = this;

        return _fs.pathExists(_path.join(post.path, 'index.md')).then(function (exists) {
            if (exists) {
                return _fs.readFile(_path.join(post.path, 'index.md'), 'utf8').then(function (str) {
                    //get front matter
                    var matter = _front(str),
                        split;

                    //augment front matter data to post object
                    post = Object.assign(post, matter.data);
                    post.content = matter.content;

                    //for post title, we need to ensure it is html escaped
                    post.title = _helper.escapeHTML(post.title);

                    //get the date
                    split = (matter.data.date.toJSON() || new Date().toJSON()).split('T')[0].split('-');
                    post.year = split[0];
                    post.month = split[1];
                    post.day = split[2];

                    //set the output path
                    if (post.config.no_date) { post.output = _path.join(post.config.output, post.slug); }
                    else {
                        post.output = _path.join(post.config.output, post.year, post.month, post.day, post.slug);
                    }

                    //get the relative url
                    post.relative = _path.join(post.config.root, _path.relative(post.config.output, post.output)).replace(/\\/g, '/');

                    //format the date
                    post.date_format = _moment(post.date).format(post.config.date_format);

                    getHeaders(site, post);

                    //extract the excerpt
                    getExcerpt(post);

                    //sometimes we have links like something.svg. If our URL does not end with a /, then then reference will be on
                    //the next slash, namely blog/ and this is errornous, so we have to detect them and use absolute paths
                    post.content = fixLinks(post);
                });
            }
            else { console.error(_path.join(post.path, 'index.md') + ' not found'); }
        });
    };

    function fixLinks(post) {
        var match,
            regex = /href=".*?\.(?:svg|svgz|png|zip|jpg|jpeg)"/g,
            content = post.content,
            ref;

        while (match = regex.exec(post.content)) {
            ref = match[0].replace(/^href="/, '').replace(/"$/, '');
            if (_path.dirname(ref) === '.') {
                ref = post.relative + '/' + ref;
                content = content.replace(match[0], 'href="' + ref + '"');
            }
        }

        return content;
    }

    function getHeaders(site, post) {
        var matches,
            head_regex = /^#{2} ?([^#]*?)\n/gm,
            tag_regex = /{% head (.*?)\|(.*?)%}/gm,
            header,
            content;

        content = post.content;

        //init if not exist, perm links are fixed shortcuts to headers
        site.perm_links = site.perm_links || {};
        site.perm_links[post.slug] = site.perm_links[post.slug] || {};
        site.headers = site.headers || {};
        site.headers[post.slug] = site.headers[post.slug] || {};

        //get all the perm links
        while (matches = tag_regex.exec(post.content)) {
            //we need to replace the content with a normal header
            content = content.replace(matches[0], matches[1].trim());

            if (site.perm_links[post.slug][matches[2].trim()]) {
                console.error('Dulplicate perm link found: ' + matches[2].trim() + ' ' + post.slug);
            }
            site.perm_links[post.slug][matches[2].trim()] = matches[1].replace(/#/g, '').trim();
        }

        //because we use content as replacement, so we must reset the content
        post.content = content;

        //get the headers
        while (matches = head_regex.exec(post.content)) {
            header = matches[1];

            //save to perm links
            site.headers[post.slug][_helper.toID(header)] = _helper.stripHTML(new _marked.Converter().makeHtml(header));
        }

        post.content = content;
    }

    function getExcerpt(post) {
        var offset = post.content.search(/<!--\s*more\s*-->/),
            content,
            html;

        //init to blank, no excerpt
        post.excerpt = '';

        //if found, we set the excerpt. We do not care about excerpt max length at this time
        //because it is up to later rendering to reduce it.
        if (offset > -1) {
            content = post.content.substr(0, offset - 1);
            html = new _marked.Converter({tables: true, extensions: Object.keys(_tags).filter(function (key) {
                    var black_list = ['post', 'site'];

                    return black_list.indexOf(key) === -1;
                }).map(function (key) {
                    return _tags[key];
                })}).makeHtml(content);
            post.excerpt = html.replace(/<\w+>|<\/\w+>/g, '');
        }
    }
};

function syncDir(src, dest, recurse, filter) {
    var sub_folders = [];

    return Promise.all([getHashes(src, sub_folders, filter), getHashes(dest, undefined, filter)]).then(function (hashes) {
        var src_hashes = hashes[0],
            dest_hashes = hashes[1],
            tasks = [];

        if (_path.basename(src) === 'tmp') { console.log(src_hashes, dest_hashes); }
        Object.keys(src_hashes).forEach(function (key) {
            //if not exist in destination, we need to copy the file over
            if (dest_hashes[key] === undefined) {
                status('Copied: ' + _path.join(src, key) + ' -> ' + _path.join(dest, key));
                tasks.push(_fs.copy(_path.join(src, key), _path.join(dest, key))
                    .catch(function() {
                        console.error('SyncDir copy failed at not exist: ' + _path.join(src, key) + ' -> ' + _path.join(dest, key));
                    }));
            }
            //if exist in destination
            else {
                //if has not same, we also need to copy
                if (dest_hashes[key] !== src_hashes[key]) {
                    status('Copied: ' + _path.join(src, key) + ' -> ' + _path.join(dest, key));
                    tasks.push(_fs.copy(_path.join(src, key), _path.join(dest, key)).catch(function () {
                        console.error('SyncDir copy failed at exist: ' + _path.join(src, key) + ' -> ' + _path.join(dest, key));
                    }));
                }

                //irrespective if exist in destination we need to remove the hash, so we have leftovers that may require removal later
                delete dest_hashes[key];
            }
        });

        //remove leftover destination files. Empty folders are not removed
        Object.keys(dest_hashes).forEach(function (key) {
            status('Removed: ' + _path.join(dest, key));
            tasks.push(_fs.remove(_path.join(dest, key)));
        });

        return Promise.all(tasks).then(function () {
            var tasks = [];

            if (recurse !== false) {
                sub_folders.forEach(function (sub) { tasks.push(syncDir(_path.join(src, sub), _path.join(dest, sub))); });

                return Promise.all(tasks);
            }
        });
    });

    function getHashes(path, sub_folders, filter) {
        var hashes = {};

        filter = filter || [];

        return _fs.pathExists(path).then(function (exists) {
            if (exists) {
                return _fs.readdir(path).then(function (files) {
                    var tasks = [];

                    files.forEach(function (file) {
                        //check if the file is a directory
                        tasks.push(_fs.stat(_path.join(path, file)).then(function (stats) {
                            if (stats.isDirectory()) {
                                //if provided we save sub folders
                                if (sub_folders) { sub_folders.push(file); }
                            }
                            //otherwise we just get the hash
                            else {
                                //we ignore files that starts with an underscore and also ignore filters
                                if (_path.basename(file).charAt(0) !== '_' &&
                                    filter.indexOf(_path.basename(file)) === -1 &&
                                    _path.extname(file) !== '.md') {
                                    return _fs.readFile(_path.join(path, file)).then(function (str) {
                                        hashes[_path.basename(file)] = _crypto.createHash('md5').update(str).digest('hex'); //_hash(str);
                                    });
                                }
                            }
                        }));
                    });

                    return Promise.all(tasks).then(function () { return hashes; });
                });
            }
            else { return hashes; }
        });
    }
}

function syncFile(str, dest) {
    return _fs.pathExists(dest).then(function (exists) {
        if (exists) {
            return _fs.readFile(dest, 'utf8').then(function (cur_str) {
                if (cur_str !== str) { return writeFile(str, dest); }
            });
        }
        else { writeFile(str, dest); }
    });

    function writeFile(str, dest) {
        status('Write: ' + dest);
        return _fs.outputFile(dest, str);
    }
}

function publish(folder, slug) {
    _fs.move(_path.join(folder, '_drafts', slug), _path.join(folder, '_posts', slug));
}

function newDraft(args) {
    var folder = _path.resolve(cwd, args[3]),
        title = args.slice(4, args.length).join(' '),
        slug = _helper.slugify(title);

    _fs.pathExists(folder).then(function (exists) {
        if (exists) {
            _fs.readFile(_path.join(cwd, 'scaffolds', 'post.md'), 'utf8').then(function (str) {
                str = str.replace('{{ title }}', title);
                str = str.replace('{{ date }}', new Date(Date.now()).toJSON());

                _fs.ensureDir(_path.join(folder, '_drafts', slug));
                _fs.outputFile(_path.join(folder, '_drafts', slug, 'index.md'), str);
            });
        }
        else { console.error(folder + ' site not found'); }
    });
}

function initFolder(folder) {
    //make the config file but only if it does not exist
    _fs.pathExists(_path.join(folder, '_config.json')).then(function (exists) {
        if (!exists) {
            _fs.outputJSON(_path.join(folder, '_config.json'), {
                title: 'Untitled',
                sub_title: 'Untitled',
                root: _path.basename(folder),
                output: folder.split(/\/|\\/g).pop()
            }, {spaces: 4});
        }
    });

    _fs.ensureDirSync(_path.join(folder, '_drafts'));
    _fs.ensureDirSync(_path.join(folder, '_posts'));
    _fs.ensureDirSync(_path.join(folder, '_theme'));
    _fs.ensureDirSync(_path.join(folder, '_theme/js'));
    _fs.ensureDirSync(_path.join(folder, '_theme/css'));
    _fs.ensureDirSync(_path.join(folder, '_theme/images'));

    _fs.outputFileSync(_path.join(folder, '_theme', '_index.ejs'));
    _fs.outputFileSync(_path.join(folder, '_theme', '_post.ejs'));
    _fs.outputFileSync(_path.join(folder, '_theme', '_tags.ejs'));

    status('Initialization completed: ' + folder);
}

function renameSlug(folder, old_slug, new_slug) {
    console.log(folder, old_slug, new_slug);
}

//Output status. We do not want console.log everywhere, so we make it into a function which we can modify easily
function status(mssg) {
    console.log(mssg);
}

module.exports = {
    generate: genFolder
};