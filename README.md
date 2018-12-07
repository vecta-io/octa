![octa-logo](https://user-images.githubusercontent.com/32937442/49627794-ce7a9080-fa1b-11e8-9ec2-a6fb5899ee8a.png) 
# Octa

Fast, smooth, reliable site generator framework by team at [vecta.io](https://vecta.io)

## Why Octa?

Lazy, we have a habit of stripping an name and add an 'a' behind. Err, it has more sides than hexa, and more is better.

## No, why make octa?

Coz, hexo is problematic with generation, need extensive gulp to ensure generation for dev and prod works, very difficult to setup multiple sites, full of bugs with tags, and not very clever.

## Octa folder structure

octa
\- site folder
  \- _drafts
  \- _posts
  \- _pages
  \- _theme

Inside the octa folder, we have site folders, each site having it's own folder. Each site folder has _drafts, _posts and _pages folder.

The _theme folder stores the theme and templates. Everything in the theme folder will be copied to output folder with the exception of files that starts with an underscore.

## How Octa works

- Everything in site/js folder will be copied to output/js
- Everything in site/images folder will be copied to output/images
- Less files in site/less folder will be generated to output/css
- Drafts and posts will be generated at output folder
    If there are extraneous files in the asset folders, they will be removed unless filtered by config.filters.asset
- If there are ejs files in site/_theme/json, they will be generated at output folder.
- Extraneous files will be removed at output folder unless filtered by config.filters.root

## Front matter
- nav_order
    Determines the order of the post in the navigation

## Tags

- {% link hyperlink | [text] %}
    shortcut to create a link
- {% plink slug | [text] %}
    shortcut to create a link to another post
- {% codeblock %} + {% endcodeblock %}
    create some codes, ensure it is properly formatted instead of using back ticks
- {% table %} + {% endtable %}
    create tables, not really necessary unless you want octa to do some formatting
- {% blockquote name | company name or occupation | [link] %} + {% endblockquote %}
    create blockquotes with cite
- {% aimg src | alt/title | attrs %}
    shortcut for asset image. attrs is padded into image, eg. class="test" or width="300"
- {% cimg src | alt/title | attrs %}
    shortcut for asset image with caption. attrs is padded into image, eg. class="test" or width="300"
- {% ctable %} + {% endctable %}
    create a column table. enter \| if want to add pipe into the table, eg. | Title \| |
- {% button some_text %}
    To add <span class="Button.cls">some_text</span>
- {% video embed_link | [text] %}
    To add collapsible iframe.
    
## Initializing a site

`node octa init site_folder`

This will setup a site folder with the bare minimum.

## New post

`node octa new site_folder your post title`

## Generating

`node octa gen site_folder [--draft]`

## Configuration

In octa folder, there is a global _config.json, which holds settings for all sites. Each site folder has it's own _config.json file, which supercede the global settings.