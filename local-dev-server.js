const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const md = require('markdown-it')({
    html: true,
    linkify: true,
    typographer: true
}).use(require('markdown-it-footnote'));
const yaml = require('js-yaml');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');

const slugify = (text) => {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')     // Replace spaces with -
        .replace(/[^\w-]+/g, '')  // Remove all non-word chars
        .replace(/--+/g, '-');    // Replace multiple - with single -
};

function convertDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

async function regenerateStaticPost(post, oldSlug = null) {
    try {
        const indexTemplate = await fs.readFile(path.join(__dirname, 'index.html'), 'utf-8');
        
        let staticHtml = indexTemplate;
        // Replace title
        staticHtml = staticHtml.replace(/<title>.*?<\/title>/, `<title>${post.title} | Md Abu Bakkar Siddik Hamim</title>`);
        // Hide home view
        staticHtml = staticHtml.replace(/<div id="home-view">/, `<div id="home-view" style="display: none;">`);
        
        // Build post content
        const postContentHtml = `
        <article id="post-content" style="display: block;">
            <div class="content-narrow">
                <span class="accent-tag">${post.category}</span>
                <h1 class="post-title">${post.title}</h1>
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; color: var(--text-secondary);">
                    <a href="/about/" style="width: 40px; height: 40px; border-radius: 50%; background: #ccc; overflow: hidden; display: block;" title="About the Author">
                        <img src="/photos/self.webp" alt="Md Abu Bakkar Siddik Hamim" style="width: 100%; height: 100%; object-fit: cover;">
                    </a>
                    <div>
                        <a href="/about/" class="author-link" style="font-size: 1.1rem; display: block; margin-bottom: 0.2rem;">Md Abu Bakkar Siddik Hamim</a>
                        <small>${convertDate(post.date)}</small>
                    </div>
                </div>
                ${post.image ? `<img src="${post.image}" alt="${post.title}" class="post-hero-image">` : ''}
                <div class="article-body">
                    ${post.content}
                </div>
                <div style="margin-top: 4rem; padding-top: 2rem; border-top: 1px solid var(--border);">
                    <h3>Tags</h3>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem;">
                        ${post.tags.map(tag => `<span style="background: var(--bg-secondary); padding: 0.25rem 0.75rem; font-size: 0.875rem;">${tag}</span>`).join('')}
                    </div>
                </div>
            </div>
            
            <section style="margin-top: 6rem;" id="static-related-posts">
                <!-- Related posts will be injected here by scripts.js dynamically to avoid staleness -->
            </section>
        </article>
        <script>window.IS_STATIC_POST = true;</script>
        `;

        staticHtml = staticHtml.replace(/<article id="post-content" style="display: none;">[\s\S]*?<\/article>/, postContentHtml);

        const postContentDir = path.join(POSTS_CONTENT_DIR, post.id.toString());
        await fs.ensureDir(postContentDir);
        // Save to Posts/<id>/index.html
        await fs.writeFile(path.join(postContentDir, 'index.html'), staticHtml);

        // Update vercel.json rewrite instead of creating a folder
        const vercelPath = path.join(__dirname, 'vercel.json');
        let vercelConfig = { cleanUrls: true, rewrites: [] };
        if (await fs.pathExists(vercelPath)) {
            try {
                vercelConfig = JSON.parse(await fs.readFile(vercelPath, 'utf-8'));
            } catch (err) {
                console.error("Could not parse vercel.json", err);
            }
        }

        // Initialize rewrites if not existing
        if (!vercelConfig.rewrites) vercelConfig.rewrites = [];

        // Remove old rewrites for this post, and default rewrites so we can append them at the end
        vercelConfig.rewrites = vercelConfig.rewrites.filter(r => 
            r.source !== `/${post.slug}` && 
            (oldSlug ? r.source !== `/${oldSlug}` : true) &&
            r.source !== "/posts" && 
            r.source !== "/(.*)"
        );

        // Add specific rewrite for this post
        vercelConfig.rewrites.push({
            source: `/${post.slug}`,
            destination: `/Posts/${post.id}`
        });

        // Re-append fallback rewrites
        vercelConfig.rewrites.push({ source: "/posts", destination: "/posts.json" });
        vercelConfig.rewrites.push({ source: "/(.*)", destination: "/index.html" });

        await fs.writeFile(vercelPath, JSON.stringify(vercelConfig, null, 4));
        console.log(`Updated vercel.json for ${post.slug}`);
    } catch (e) {
        console.error('Error generating static post for ' + post.slug, e);
    }
}

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Setup multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const POSTS_FILE = path.join(__dirname, 'posts.json');
const POSTS_CONTENT_DIR = path.join(__dirname, 'Posts');

// Ensure Posts directory exists
fs.ensureDirSync(POSTS_CONTENT_DIR);

// GET /posts - Return all posts
app.get('/posts', async (req, res) => {
    try {
        const posts = JSON.parse(await fs.readFile(POSTS_FILE, 'utf-8'));
        res.json(posts);
    } catch (error) {
        console.error('GET /posts error:', error);
        res.status(500).send('Error reading posts: ' + error.message);
    }
});

// GET /posts/:id - Return a single post
app.get('/posts/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const posts = JSON.parse(await fs.readFile(POSTS_FILE, 'utf-8'));
        const post = posts.find(p => p.id === id);
        if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });
        res.json(post);
    } catch (error) {
        res.status(500).send('Error reading post.');
    }
});

// GET /categories - Return all unique categories
app.get('/categories', async (req, res) => {
    try {
        console.log('Fetching unique categories...');
        const posts = JSON.parse(await fs.readFile(POSTS_FILE, 'utf-8'));
        const categories = [...new Set(posts.map(p => p.category).filter(Boolean))];
        console.log(`Found ${categories.length} categories:`, categories);
        res.json(categories.sort());
    } catch (error) {
        console.error('Error in /categories:', error);
        res.status(500).json([]);
    }
});

// GET /tags - Return all unique tags
app.get('/tags', async (req, res) => {
    try {
        console.log('Fetching unique tags...');
        const posts = JSON.parse(await fs.readFile(POSTS_FILE, 'utf-8'));
        const tags = [...new Set(posts.flatMap(p => p.tags || []).filter(Boolean))];
        console.log(`Found ${tags.length} unique tags:`, tags);
        res.json(tags.sort());
    } catch (error) {
        console.error('Error in /tags:', error);
        res.status(500).json([]);
    }
});

// PUT /posts/:id - Update a post
app.put('/posts/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const updatedData = req.body;
        let posts = JSON.parse(await fs.readFile(POSTS_FILE, 'utf-8'));
        const postIndex = posts.findIndex(p => p.id === id);

        if (postIndex === -1) return res.status(404).json({ success: false, message: 'Post not found.' });

        // Generate new HTML if raw_content was provided
        if (updatedData.raw_content) {
            let htmlContent = md.render(updatedData.raw_content);
            htmlContent = htmlContent.replace(/<img /g, '<img class="article-image" ');
            updatedData.content = htmlContent;
        }

        // Update post metadata
        const oldSlug = posts[postIndex].slug;
        posts[postIndex] = { ...posts[postIndex], ...updatedData };
        await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 4));

        // Sync metadata back to the master Markdown file's frontmatter
        const postContentDir = path.join(POSTS_CONTENT_DIR, id.toString());
        if (await fs.pathExists(postContentDir)) {
            const files = await fs.readdir(postContentDir);
            const mdFile = files.find(f => f.endsWith('.md'));
            if (mdFile) {
                const mdPath = path.join(postContentDir, mdFile);
                const fileContent = await fs.readFile(mdPath, 'utf-8');
                const parts = fileContent.split('---');
                if (parts.length >= 3) {
                    try {
                        let frontMatter = yaml.load(parts[1]) || {};
                        if (updatedData.title) frontMatter.title = updatedData.title;
                        if (updatedData.category) frontMatter.category = updatedData.category;
                        if (updatedData.tags) frontMatter.tags = updatedData.tags;
                        if (updatedData.date) frontMatter.date = updatedData.date;
                        if (updatedData.excerpt) frontMatter.excerpt = updatedData.excerpt;
                        if (updatedData.image) frontMatter.image = updatedData.image;
                        
                        const newFrontMatter = yaml.dump(frontMatter);
                        const newMdContent = `---\n${newFrontMatter}---\n${parts.slice(2).join('---').replace(/^\\s+/, '')}`;
                        await fs.writeFile(mdPath, newMdContent, 'utf-8');
                    } catch (err) {
                        console.error('Error syncing frontmatter to .md file:', err);
                    }
                }
            }
        }

        await regenerateStaticPost(posts[postIndex], oldSlug);

        res.json({ success: true, post: posts[postIndex] });
    } catch (error) {
        console.error('PUT /posts/:id error:', error);
        res.status(500).send('Error updating post.');
    }
});

// DELETE /posts/:id - Delete a post AND its images
app.delete('/posts/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        let posts = JSON.parse(await fs.readFile(POSTS_FILE, 'utf-8'));

        // Find existing post to log deletion and get slug
        const postToDelete = posts.find(p => p.id === id);
        if (!postToDelete) return res.status(404).json({ success: false, message: 'Post not found.' });

        // Filter out the post
        posts = posts.filter(p => p.id !== id);
        await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 4));

        // DELETE REWRITE IN VERCEL.JSON
        if (postToDelete.slug) {
            const vercelPath = path.join(__dirname, 'vercel.json');
            if (await fs.pathExists(vercelPath)) {
                try {
                    let vercelConfig = JSON.parse(await fs.readFile(vercelPath, 'utf-8'));
                    if (vercelConfig.rewrites) {
                        vercelConfig.rewrites = vercelConfig.rewrites.filter(r => r.source !== `/${postToDelete.slug}`);
                        await fs.writeFile(vercelPath, JSON.stringify(vercelConfig, null, 4));
                    }
                } catch (err) {
                    console.error("Could not parse vercel.json during deletion", err);
                }
            }
        }

        // DELETE THE CONTENT DIRECTORY FOR THIS POST
        const postContentDir = path.join(POSTS_CONTENT_DIR, id.toString());
        if (await fs.pathExists(postContentDir)) {
            await fs.remove(postContentDir);
            console.log(`Deleted content for post ${id}`);
        }

        // DELETE THE STATIC SLUG FOLDER
        const postToDel = posts.find(p => p.id === id); // But wait, we already filtered it out
        // Wait, need to find it before filtering to delete slug
        // Let's modify above logic slightly
        res.json({ success: true });
    } catch (error) {
        console.error('DELETE error:', error);
        res.status(500).send('Error deleting post.');
    }
});

// GET /posts/:id/markdown - Get raw markdown file content
app.get('/posts/:id/markdown', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const postContentDir = path.join(POSTS_CONTENT_DIR, id.toString());
        
        if (!(await fs.pathExists(postContentDir))) {
            return res.status(404).json({ success: false, message: 'Content directory not found.' });
        }
        
        const files = await fs.readdir(postContentDir);
        const mdFile = files.find(f => f.endsWith('.md'));
        
        if (!mdFile) {
            return res.status(404).json({ success: false, message: 'Markdown file not found.' });
        }
        
        const mdContent = await fs.readFile(path.join(postContentDir, mdFile), 'utf-8');
        res.json({ success: true, content: mdContent, fileName: mdFile });
    } catch (error) {
        console.error('GET /posts/:id/markdown error:', error);
        res.status(500).json({ success: false, message: 'Error reading markdown.' });
    }
});

// PUT /posts/:id/markdown - Update raw markdown file and update posts.json content
app.put('/posts/:id/markdown', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { content, fileName } = req.body;
        
        if (!content) return res.status(400).json({ success: false, message: 'Content is required.' });
        
        const postContentDir = path.join(POSTS_CONTENT_DIR, id.toString());
        if (!(await fs.pathExists(postContentDir))) {
            return res.status(404).json({ success: false, message: 'Content directory not found.' });
        }
        
        // Write the new content to the .md file
        const mdFileName = fileName || 'post.md';
        await fs.writeFile(path.join(postContentDir, mdFileName), content, 'utf-8');
        
        // Parse the new markdown
        const parts = content.split('---');
        let bodyContent = content;
        let frontMatter = {};
        
        if (parts.length >= 3) {
            try {
                frontMatter = yaml.load(parts[1]);
                bodyContent = parts.slice(2).join('---').trim();
            } catch (err) {
                console.error('YAML parse error during markdown update:', err);
            }
        }
        
        // Convert invisible markers
        bodyContent = bodyContent.replace(/\u00A0/g, ' ');
        
        // Update posts list
        let posts = JSON.parse(await fs.readFile(POSTS_FILE, 'utf-8'));
        const postIndex = posts.findIndex(p => p.id === id);
        
        if (postIndex === -1) return res.status(404).json({ success: false, message: 'Post not found in posts.json' });
        
        const oldSlug = posts[postIndex].slug;
        
        const files = await fs.readdir(postContentDir);
        const imageMap = {};
        for (const file of files) {
            if (file.endsWith('.webp')) {
                const baseName = path.basename(file, '.webp');
                imageMap[baseName] = `/Posts/${id}/${file}`;
                imageMap[file] = `/Posts/${id}/${file}`;
                imageMap[baseName + '.png'] = `/Posts/${id}/${file}`;
                imageMap[baseName + '.jpg'] = `/Posts/${id}/${file}`;
                imageMap[baseName + '.jpeg'] = `/Posts/${id}/${file}`;
            }
        }

        bodyContent = bodyContent.replace(/!\[\[(.*?)\]\]/g, (match, fName) => {
            const webpPath = imageMap[fName] || imageMap[path.basename(fName)];
            if (webpPath) {
                return `![${fName}](${webpPath})`;
            }
            return match;
        });

        bodyContent = bodyContent.replace(/\[\[(.*?)(?:\|(.*?))?\]\]/g, (match, slug, text) => {
            const displayText = text || slug;
            const targetSlug = slugify(slug);
            return `[${displayText}](?${targetSlug})`;
        });

        let htmlContent = md.render(bodyContent);
        htmlContent = htmlContent.replace(/<img /g, '<img class="article-image" ');
        
        if (frontMatter.title) posts[postIndex].title = frontMatter.title;
        if (frontMatter.category) posts[postIndex].category = frontMatter.category;
        if (frontMatter.tags) posts[postIndex].tags = frontMatter.tags;
        if (frontMatter.date) posts[postIndex].date = frontMatter.date;
        if (frontMatter.excerpt) posts[postIndex].excerpt = frontMatter.excerpt;
        
        posts[postIndex].content = htmlContent;
        posts[postIndex].raw_content = bodyContent;
        
        await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 4));
        
        await regenerateStaticPost(posts[postIndex], oldSlug);

        res.json({ success: true, post: posts[postIndex] });
    } catch (error) {
        console.error('PUT /posts/:id/markdown error:', error);
        res.status(500).json({ success: false, message: 'Error saving markdown.' });
    }
});

app.post('/upload', upload.fields([
    { name: 'markdown', maxCount: 1 },
    { name: 'images' }
]), async (req, res) => {
    try {
        if (!req.files['markdown']) {
            return res.status(400).send('No markdown file uploaded.');
        }

        const mdFile = req.files['markdown'][0];
        const mdContent = mdFile.buffer.toString('utf-8');

        // 1. Parse Front Matter
        const parts = mdContent.split('---');
        if (parts.length < 3) {
            return res.status(400).send('Invalid Markdown: Missing YAML front matter.');
        }

        const frontMatter = yaml.load(parts[1]);
        let content = parts.slice(2).join('---').trim();

        // 2. Content Cleanup: Convert common invisible markers that break justification
        content = content.replace(/\u00A0/g, ' '); // Non-breaking space -> regular space

        // 3. Prepare POST ID FIRST (to create the correct directory)
        const posts = JSON.parse(await fs.readFile(POSTS_FILE, 'utf-8'));
        const newId = posts.length > 0 ? Math.max(...posts.map(p => p.id)) + 1 : 1;
        const postContentDir = path.join(POSTS_CONTENT_DIR, newId.toString());
        await fs.ensureDir(postContentDir);

        // Save original markdown file
        const mdFileName = mdFile.originalname || 'post.md';
        await fs.writeFile(path.join(postContentDir, mdFileName), mdFile.buffer);

        // 3. Process All Uploaded Images INTO the subfolder
        const uploadedImages = req.files['images'] || [];
        const imageMap = {};

        for (const file of uploadedImages) {
            const ext = path.extname(file.originalname).toLowerCase();
            const baseName = path.basename(file.originalname, ext);
            const webpName = `${baseName}.webp`;
            const targetPath = path.join(postContentDir, webpName);

            // Check if larger than 300KB
            const isSmall = file.buffer.length < 307200;

            let sharpInstance = sharp(file.buffer);

            if (isSmall) {
                // If small, don't resize and keep high quality
                await sharpInstance
                    .webp({ quality: 95 })
                    .toFile(targetPath);
            } else {
                // If large, resize and compress
                await sharpInstance
                    .webp({ quality: 80 })
                    .resize(1200, null, { withoutEnlargement: true })
                    .toFile(targetPath);
            }

            // Path used in JSON/HTML
            imageMap[file.originalname] = `/Posts/${newId}/${webpName}`;
        }

        // 4. Handle Obsidian-style images ![[image.png]]
        content = content.replace(/!\[\[(.*?)\]\]/g, (match, fileName) => {
            const webpPath = imageMap[fileName] || imageMap[path.basename(fileName)];
            if (webpPath) {
                return `![${fileName}](${webpPath})`;
            }
            return match;
        });

        // 5. Handle Obsidian-style internal links [[slug]] or [[slug|display text]]
        content = content.replace(/\[\[(.*?)(?:\|(.*?))?\]\]/g, (match, slug, text) => {
            const displayText = text || slug;
            const targetSlug = slugify(slug);
            return `[${displayText}](?${targetSlug})`;
        });

        // 6. Convert Markdown to HTML and inject classes
        let htmlContent = md.render(content);
        htmlContent = htmlContent.replace(/<img /g, '<img class="article-image" ');

        // 7. Explicitly handle Hero/Cover Image
        let heroImage = frontMatter.image || '';
        if (imageMap[heroImage]) {
            heroImage = imageMap[heroImage];
        } else if (imageMap[path.basename(heroImage)]) {
            heroImage = imageMap[path.basename(heroImage)];
        }

        // 8. Save the final JSON
        const newPost = {
            id: newId,
            slug: slugify(frontMatter.title || 'untitled'),
            title: frontMatter.title || 'Untitled',
            category: frontMatter.category || 'Uncategorized',
            tags: frontMatter.tags || [],
            date: frontMatter.date || new Date().toISOString(),
            excerpt: frontMatter.excerpt || '',
            content: htmlContent,
            raw_content: content,
            image: heroImage
        };

        posts.unshift(newPost);
        await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 4));

        await regenerateStaticPost(newPost);

        res.json({ success: true, post: newPost });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).send('Internal Server Error: ' + error.message);
    }
});

// Serve static files AFTER API routes to prevent folder matches from intercepting API calls
app.use(express.static('.'));

// Fallback route for local development to serve the static post from the post ID folder
// This mimics Vercel's rewrite functionality locally
app.get('/:slug', async (req, res, next) => {
    try {
        const posts = JSON.parse(await fs.readFile(POSTS_FILE, 'utf-8'));
        const post = posts.find(p => p.slug === req.params.slug);
        if (post) {
            const staticHtmlPath = path.join(POSTS_CONTENT_DIR, post.id.toString(), 'index.html');
            if (await fs.pathExists(staticHtmlPath)) {
                return res.sendFile(staticHtmlPath);
            }
        }
    } catch (err) {
        console.error("Local routing error:", err);
    }
    next();
});

// Single Page App Fallback locally mimicking vercel rewrites /index.html
app.use((req, res) => {
    if (req.method === 'GET') {
        res.sendFile(path.join(__dirname, 'index.html'));
    } else {
        res.status(404).send('Not found');
    }
});

app.listen(port, () => {
    console.log(`Admin server running at http://localhost:${port}`);
});
