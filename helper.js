"use strict";

var _stripTags = require('striptags'),
    _minor = require('title-case-minors'),
    _escape = require('escape-html'),
    helper = {};

//helper cannot have makeHTML because of recursion with _tags calling _helper

helper.toID = function(str) {
    return str.replace(/[^\w]/g, '').toLowerCase();
};

helper.escapeHTML = function (str) {
    return _escape(str);
};

helper.postByTag = function (site, tag) {
    var posts = [];

    site.sorted.forEach(function (slug) {
        if ((site.posts[slug].tags || []).indexOf(tag) > -1) { posts.push(site.posts[slug]); }
    });

    return posts;
};

helper.titleCase = function (str) {
    return str.split(' ').map(function (word) {
        return _minor.indexOf(word) > -1 ? word : word.charAt(0).toUpperCase() + word.substr(1, word.length - 1);
    }).join(' ');
};

helper.tags = function (tags, root, no_dot) {
    return (tags || []).map(function (tag) {
        return (no_dot ? '' : ' &middot; ') + '<a href="' + root + '/tags/' + helper.slugify(tag) + '">' + tag + '</a>';
    }).join('');
};

helper.stripHTML = function (str, allowed) {
    return allowed ? _stripTags(str, allowed).replace(/`/g, '') : _stripTags(str).replace(/`/g, '');
};

helper.slugify = function (str) {
    return str.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-\-+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
};

helper.getArgs = function (str) {
    str = str.replace(/\\\|/g, '@@@');

    return str.split('|').map(function (arg) { return arg.trim().replace(/@@@/g, '|');});
};

helper.replace = function (str, prev, cur) {
    return str ? str.replace(prev, cur) : str;
};

module.exports = helper;