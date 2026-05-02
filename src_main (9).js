// Apify SDK - toolkit for building Apify Actors (Read more at https://docs.apify.com/sdk/js/)
import { Actor } from 'apify';
// Crawlee - web scraping and browser automation library (Read more at https://crawlee.dev)
import { CheerioCrawler, Dataset } from 'crawlee';
import { convert } from 'html-to-text';

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init()
await Actor.init();

// Structure of input is defined in input_schema.json
const {
    startUrls = ['https://crawlee.dev'],
    maxRequestsPerCrawl = 100,
    includeCodeBlocks = true,
    formatForLLM = true,
} = (await Actor.getInput()) ?? {};

// Proxy configuration to rotate IP addresses and prevent blocking (https://docs.apify.com/platform/proxy)
const proxyConfiguration = await Actor.createProxyConfiguration();

// Helper function to convert HTML to optimized Markdown for LLM
function htmlToMarkdown($, html) {
    // Extract main content
    const mainContent = $('main, article, .content, #content, .doc-content').first();
    const contentHtml = mainContent.length ? mainContent.html() : html;

    // Basic HTML to Markdown conversion
    let markdown = contentHtml
        .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
        .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
        .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
        .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n')
        .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n')
        .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n')
        .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
        .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
        .replace(/<pre[^>]*>(.*?)<\/pre>/gi, '```\n$1\n```\n')
        .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
        .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
        .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
        .replace(/<a[^>]*href=['"]([^'"]*?)['"][^>]*>(.*?)<\/a>/gi, '[$2]($1)')
        .replace(/<br[^>]*>/gi, '\n')
        .replace(/<\/?(div|section|article|main)[^>]*>/gi, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\n{3,}/g, '\n\n'); // Clean up excessive newlines

    return markdown.trim();
}

const crawler = new CheerioCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl,
    async requestHandler({ enqueueLinks, request, $, log }) {
        log.info(`Crawling: ${request.loadedUrl}`);

        // Enqueue links to related documentation pages
        await enqueueLinks({
            globs: ['**/*'],
            strategy: 'same-hostname',
        });

        // Extract title
        const title = $('title').text() || $('h1').first().text() || 'Untitled';

        // Extract and convert content to Markdown
        const html = $.html();
        const markdown = htmlToMarkdown($, html);

        // Only save if we have meaningful content
        if (markdown.length > 50) {
            log.info(`Saved: ${title}`, { url: request.loadedUrl });

            // Save to Dataset - optimized for LLM fine-tuning
            await Dataset.pushData({
                title,
                url: request.loadedUrl,
                markdown,
                scrapedAt: new Date().toISOString(),
            });
        }
    },
});

await crawler.run(startUrls);

// Gracefully exit the Actor process. It's recommended to quit all Actors with an exit()
await Actor.exit();