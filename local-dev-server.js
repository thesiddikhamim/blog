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

        // 2. Prepare POST ID FIRST (to create the correct directory)
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
                return `<img src="${webpPath}" alt="${fileName}" class="article-image">`;
            }
            return match;
        });

        // 5. Convert Markdown to HTML
        const htmlContent = md.render(content);

        // 6. Explicitly handle Hero/Cover Image
        let heroImage = frontMatter.image || '';
        if (imageMap[heroImage]) {
            heroImage = imageMap[heroImage];
        } else if (imageMap[path.basename(heroImage)]) {
            heroImage = imageMap[path.basename(heroImage)];
        }

        // 7. Save the final JSON
        const slugify = (text) => {
            return text
                .toString()
                .toLowerCase()
                .trim()
                .replace(/\s+/g, '-')     // Replace spaces with -
                .replace(/[^\w-]+/g, '')  // Remove all non-word chars
                .replace(/--+/g, '-');    // Replace multiple - with single -
        };

        const newPost = {
            id: newId,
            slug: slugify(frontMatter.title || 'untitled'),
            title: frontMatter.title || 'Untitled',
            category: frontMatter.category || 'Uncategorized',
            tags: frontMatter.tags || [],
            date: frontMatter.date || new Date().toISOString(),
            excerpt: frontMatter.excerpt || '',
            content: htmlContent,
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
