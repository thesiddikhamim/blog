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

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

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
        posts[postIndex] = { ...posts[postIndex], ...updatedData };
        await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 4));

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

        // Find existing post to log deletion
        const postExists = posts.some(p => p.id === id);
        if (!postExists) return res.status(404).json({ success: false, message: 'Post not found.' });

        // Filter out the post
        posts = posts.filter(p => p.id !== id);
        await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 4));

        // DELETE THE CONTENT DIRECTORY FOR THIS POST
        const postContentDir = path.join(POSTS_CONTENT_DIR, id.toString());
        if (await fs.pathExists(postContentDir)) {
            await fs.remove(postContentDir);
            console.log(`Deleted content for post ${id}`);
        }

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

        res.json({ success: true, post: newPost });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).send('Internal Server Error: ' + error.message);
    }
});

app.listen(port, () => {
    console.log(`Admin server running at http://localhost:${port}`);
});
