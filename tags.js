"use strict";

var tags = {},
    _helper = require('./helper'),
    _path = require('path'),
    _marked = require('showdown');

// {
//     type: 'lang',
//         regex: /%start%([^]+?)%end%/gi,
//     replace: function(s, match) {
//     matches.push(match);
//     var n = matches.length - 1;
//     return '%PLACEHOLDER' + n + '%';
// }
// },
// {
//     type: 'output',
//         filter: function (text) {
//     for (var i=0; i< matches.length; ++i) {
//         var pat = '<p>%PLACEHOLDER' + i + '% *<\/p>';
//         text = text.replace(new RegExp(pat, 'gi'), matches[i]);
//     }
//     //reset array
//     matches = [];
//     return text;
// }
// }

tags.ctable = {
    type: 'lang',
    regex: /{% ?ctable (.*?) ?%}\n?(.*?){% ?endctable ?%}/gs,
    replace: function (str, args, content) {
        var html = '',
            rows = 0,
            cols = 0;

        //split into lines
        content.split('\n').forEach(function (line) {
            var cells;

            //do not do if line is empty
            if (line.trim() !== '') {
                //for escaped pipe, we need to replace
                line = line.replace(/\\\|/g, '@@@');

                cells = line.split(/ ?\| ?/);

                //remove the first item if empty
                if (cells[0].trim() === '') { cells.shift(); }
                //remove the last item if empty
                if (cells[cells.length - 1].trim() === '') { cells.pop(); }

                //save the max columns
                if (cols < cells.length) { cols = cells.length; }
                //increment the rows
                rows++;

                cells.forEach(function (cell) { html += '<div>' + cell.replace(/@@@/g, '|') + '</div>'; });

            }
        });

        //fixme: irrespective of the columns, we cannot pivot rows more than 3, so we need an error
        //2x2, 2x3, 2x4, 2x5, 2x6, 3x2, 3x3, 3x4, 3x5, 3x6, 4x2, 4x3, 5x2, 5x3, 6x2, 6x3
        if ((cols === 2 && rows > 6) || (cols === 3 && rows > 6) || (cols === 4 && rows > 3) ||
            (cols === 5 && rows > 3) || (cols === 6 && rows > 3)) {
            console.error('(ctable) Invalid rows or column: rows: ' + rows + ' cols: ' + cols + ' ' + tags.post.slug);
        }
        else {
            return '<div class="FlexTable.cls Cols' + cols + '.cls Rows' + rows + '.cls">' + html + '</div>';
        }
    }
};

tags.cimg = {
    type: 'lang',
    regex: /{% ?cimg (.*?) ?%}/g,
    replace: function (str, args) {
        var title;

        args = _helper.getArgs(args);

        if (args.length > 3) {
            console.error('(cimg) More than 3 arguments:' + JSON.stringify(args) + ' ' + tags.post.slug);
        }
        else {
            title = args[1] ? new _marked.Converter().makeHtml(args[1]) : '';

            return '<figure>' +
                '<img src="' + _path.join(tags.post.relative, args[0]).replace(/\\/g, '/') + '"' +
                (title ? ' alt="' + _helper.stripHTML(title) + '" title="' + _helper.stripHTML(title) + '"' : '') +
                (args[2] ? ' ' + args[2] : '') + '>' +
                (title ? '<figcaption>' + _helper.stripHTML(title, '<code>') + '</figcaption>' :'') +
                '</figure>';
        }
    }
};

tags.aimg = {
    type: 'lang',
    regex: /{% ?aimg (.*?) ?%}/g,
    replace: function (str, args) {
        args = _helper.getArgs(args);

        if (args.length > 3) {
            console.error('(aimg) More than 3 arguments:' + JSON.stringify(args) + ' ' + tags.post.slug);
            console.error('Usage: {% aimg your-image-name.svg | [Title] | [attrs] %}')
        }
        else {
            return '@-@aimg@@@' + args[0] + '@@@' + (args[1] || '') + '@@@' + (args[2] || '') + '@-@';
        }
    }
};

tags._aimg = {
    type: 'output',
    filter: function (content) {
        var regex = /(?:<p>)?@-@(.*?)@-@(?:<\/p>)?/g,
            args,
            matches,
            str,
            ret = content;

        while (matches = regex.exec(content)) {
            args = matches[1].split('@@@');
            str = args[2] ? new _marked.Converter().makeHtml(args[2]) : '';

            ret = ret.replace(matches[0], '<img src="' + _path.join(tags.post.relative, args[1]).replace(/\\/g, '/') + '"' +
                (str ? ' alt="' + _helper.stripHTML(str) + '" title="' + _helper.stripHTML(str) + '"' : '') +
                (args[3] ? ' ' + args[3] : '') +
                '>');
        }

        return ret;
    }
};

tags.update = {
    type: 'lang',
    regex: /{% ?update (.*?) ?%}\n?(.*?){% ?endupdate ?%}/gs,
    replace: function (str, args, content) {
        content = new _marked.Converter().makeHtml(content);

        return content.replace('<ul>', '<ul class="Update.cls">');
    }
};

tags.tldr = {
    type: 'lang',
    regex: /{% ?tldr (.*?) ?%}\n?(.*?){% ?endtldr ?%}/gs,
    replace: function (str, args, content) {
        content = new _marked.Converter().makeHtml(content);

        return content.replace('<p>', '<p class="TLDR.cls">');
    }
};

tags.blockquote = {
    type: 'lang',
    regex: /{% ?blockquote (.*?) ?%}\n?(.*?){% ?endblockquote ?%}/gs,
    replace: function (str, args, content) {
        content = new _marked.Converter().makeHtml(content);
        args = _helper.getArgs(args);

        switch (args.length) {
            case 0: return '<blockquote>' + content + '</blockquote>';
            case 1: return '<blockquote>' + content + '<cite>' + args[0] + '</cite></blockquote>';
            case 2: return '<blockquote>' + content + '<cite>' + args[0] + ', ' + args[1] + '</cite></blockquote>';
            case 3: return '<blockquote>' + content + '<cite>' + args[0] + '<a href="' + args[2] + '">' + args[1] + '</a>' + '</cite></blockquote>';
            default:
                console.error('(blockquote) Have 2 or more than 3 arguments: ' + JSON.stringify(args) + ' ' + tags.post.slug);
                console.error('Usage: {% blockquote Name | Company name or occupation | link %} or {% blockquote Name | Company name or occupation %}');
                break;
        }
    }
};

tags.table = {
    type: 'lang',
    regex: /{% ?table (.*?) ?%}\n?(.*?){% endtable %}/gs,
    replace: function (str, args, content) {
        var html = new _marked.Converter({tables: true}).makeHtml(content),
            reg_td = /<td> ?(%.*?% )(.*?)<\/td>/g,
            reg_th = /<th>(.*?)<\/th>/g,
            empty_th = true,
            match;

        args = _helper.getArgs(args);

        //Add table class name if available
        if (args.length > 0 && args[0] !== undefined) {
            html = html.replace('<table>', '<table ' + args[0] + '>');
        }

        //scan through td and replace classes if found
        while ((match = reg_td.exec(html)) !== null) {
            html = html.replace(match[0], '<td class="' + match[1].replace(/%/g, '').trim() + '.cls">' + match[2] + '</td>');
        }

        //scan through th and remove header if all th is empty
        while ((match = reg_th.exec(html)) !== null) {
            //if th has content, we break and do not remove header
            if (match[1] !== '') {
                empty_th = false;
                break;
            }
        }

        //if all th is empty, we need to remove header
        if (empty_th) {
            html = html.replace(/\n<th><\/th>/g, '').replace(/\n<thead>\n<tr>\n<\/tr>\n<\/thead>/g, '');
        }

        return html;
    }
};

tags.codeblock = {
    type: 'lang',
    regex: /{% ?codeblock (.*?) ?%}\n?(.*?){% ?endcodeblock ?%}/gs,
    replace: function (str, args, content) {
        args = _helper.getArgs(args);

        return '<pre class="prettyprint' + (args[0] === '' ? '' : ' ' + args[0]) + '" title="Click to copy codes"><code>' + content + '</code></pre>';
    }
};

tags.see = {
    type: 'lang',
    regex: /{% ?see (.*?) ?%}\n?(.*?){% ?endsee ?%}/gs,
    replace: function (str, args, content) {
        //first we need to break the content into lines
        var lines = content.split('\n'),
            html = '';

        lines.forEach(function (line) {
            var split,
                link,
                text,
                slug,
                head;

            line = line.trim();

            if (line) {
                //we break the separator, the first item is the text, the second item the link
                //example some text | slug#anchor
                split = line.split('|');
                link = split[0].trim();
                text = (split[1] || '').trim();
                split = link.split('#');
                slug = split[0].trim();
                head = (split[1] || '').trim();

                //does the slug exist
                if (tags.site.posts[slug]) {
                    //do we have a head ?
                    if (head) {
                        //does the header exist
                        if (tags.site.perm_links[slug][head]) {
                            //if there are no text, use the post title
                            html += '<li>' +
                                '<a href="' + tags.site.posts[slug].relative + '/#' + _helper.toID(tags.site.perm_links[slug][head]) + '">' +
                                    (text || tags.site.perm_links[slug][head]) +
                                '</a>' +
                                '</li>';
                        }
                        else if (tags.site.headers[slug][head]) {
                            //if there are no text, use the post title
                            html += '<li>' +
                                '<a href="' + tags.site.posts[slug].relative + '/#' + _helper.toID(tags.site.headers[slug][head]) + '">' +
                                (text || tags.site.headers[slug][head]) +
                                '</a>' +
                                '</li>';
                        }
                        else {
                            console.error('See header not found: ' + line + ' ' + tags.post.slug);
                        }
                    }
                    else {
                        //if there are no text, use the post title
                        html += '<li><a href="' + tags.site.posts[slug].relative + '/">' + (text || tags.site.posts[slug].title) + '</a></li>';
                    }
                }
                else {
                    console.error('See slug not found: ' + line + ' ' + tags.post.slug);
                }
            }
        });

        if (html) {
            html = '<div class="See.cls"><ul>' + html + '</ul><p>&nbsp;See also&nbsp;</p></div>';
        }

        return html;
    }
};

tags.rem = {
    type: 'lang',
    regex: /{% ?rem (.*?) ?%}/g,
    replace: function (str, args) {
        console.warn('Reminder: ' + args);
        return '';
    }
};

//Post link
tags.plink = {
    type: 'lang',
    regex: /{% ?plink (.*?) ?%}/g,
    replace: function (str, args) {
        var split,
            slug,
            head,
            html = '',
            text;

        args = _helper.getArgs(args);

        if (args.length > 2) {
            console.error('(plink) More than 2 arguments:' + JSON.stringify(args) + ' ' + tags.post.slug);
            console.error('Usage: {% plink slug[#head] | [title] %}');
        }
        else {
            split = args[0].split('#');
            slug = split[0].trim();
            head = (split[1] || '').trim();
            text = args.length === 2 ? args[1] : '';

            //do we have a post?
            if (tags.site.posts[slug]) {
                //do we have a header?
                if (head) {
                    if (tags.site.perm_links[slug][head]) {
                        html = '<a href="' + tags.site.posts[slug].relative + '/#' + _helper.toID(tags.site.perm_links[slug][head]) + '">' +
                            (text || tags.site.perm_links[slug][head]) +
                            '</a>';
                    }
                    else if (tags.site.headers[slug][head]) {
                        html = '<a href="' + tags.site.posts[slug].relative + '/#' + _helper.toID(tags.site.headers[slug][head]) + '">' +
                            (text || tags.site.headers[slug][head]) +
                            '</a>';
                    }
                    else {
                        console.error('Plink head not found: ' + JSON.stringify(args) + ' ' + tags.post.slug);
                    }
                }
                else {
                    html = '<a href="' + tags.site.posts[slug].relative + '/">' + (text || tags.site.posts[slug].title) + '</a>';
                }
            }
            else {
                console.error('Plink post not found: ' + JSON.stringify(args) + ' ' + tags.post.slug);
            }

            return html;
        }
    }
};

tags.link = {
    type: 'lang',
    regex: /{% ?link (.*?) ?%}/g,
    replace: function (str, args) {
        args = _helper.getArgs(args);

        if (args.length > 2) {
            console.error('(link) More than 2 arguments: ' + JSON.stringify(args) + ' ' + tags.post.slug);
            console.error('Usage: {% link url | [title] %}');
        }
        else if (args.length === 1) { return '<a href="' + args[0] + '">' + args[0] + '</a>'; }
        else { return '<a href="' + args[0] + '">' + args[1] + '</a>'; }
    }
};

tags.caption = {
    type: 'lang',
    regex: /{% ?caption (.*?) ?%}/g,
    replace: function(str, content) {
        return new _marked.Converter().makeHtml(content).replace('<p>', '<p class="Caption.cls">');
    }
};

tags.button = {
    type: 'lang',
    regex: /{% ?button (.*?) ?%}/g,
    replace: function(str, args) {
        var klass = '';

        args = _helper.getArgs(args);

        if (args.length > 3) {
            console.error('(button) More than 2 arguments:' + JSON.stringify(args) + ' ' + tags.post.slug);
        }
        else {
            if (args[1] && args[1] !== '') { klass = args[1][0].toUpperCase() + args[1].slice(1) + '.cls'; }

            return '<span class="Button.cls' + (klass ? ' ' + klass : '') + '">' + args[0] + '</span>';
        }
    }
};

tags.video = {
    type: 'lang',
    regex: /{% ?video (.*?) ?%}/g,
    replace: function(str, args) {

        args = _helper.getArgs(args);

        if (args.length > 2) {
            console.error('(video) More than 2 arguments:' + JSON.stringify(args) + ' ' + tags.post.slug);
        }
        else {
            if (args[0]) {
                return '<div class="Video.cls">' +
                    '<h3>' + args[1] + '</h3>' +
                    '<iframe src="'+ args[0] + '" allowfullscreen></iframe>' +
                '</div>';
            }
        }
    }
};

module.exports = tags;