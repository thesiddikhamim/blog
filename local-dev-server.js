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
const IMAGES_DIR = path.join(__dirname, 'images');

// Ensure images directory exists
fs.ensureDirSync(IMAGES_DIR);

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

        // DELETE THE IMAGES DIRECTORY FOR THIS POST
        const postImagesDir = path.join(IMAGES_DIR, id.toString());
        if (await fs.pathExists(postImagesDir)) {
            await fs.remove(postImagesDir);
            console.log(`Deleted images for post ${id}`);
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

        const postImagesDir = path.join(IMAGES_DIR, newId.toString());
        await fs.ensureDir(postImagesDir);

        // 3. Process All Uploaded Images INTO the subfolder
        const uploadedImages = req.files['images'] || [];
        const imageMap = {};

        for (const file of uploadedImages) {
            const ext = path.extname(file.originalname).toLowerCase();
            const baseName = path.basename(file.originalname, ext);
            const webpName = `${baseName}.webp`;
            const targetPath = path.join(postImagesDir, webpName);

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
            imageMap[file.originalname] = `images/${newId}/${webpName}`;
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
