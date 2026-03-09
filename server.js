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

        // 2. Process Images
        const uploadedImages = req.files['images'] || [];
        const imageMap = {};

        for (const file of uploadedImages) {
            const ext = path.extname(file.originalname).toLowerCase();
            const baseName = path.basename(file.originalname, ext);
            const webpName = `${baseName}.webp`;
            const targetPath = path.join(IMAGES_DIR, webpName);

            // Convert to webp and resize/compress
            await sharp(file.buffer)
                .webp({ quality: 75 })
                .resize(1200, null, { withoutEnlargement: true })
                .toFile(targetPath);

            imageMap[file.originalname] = `images/${webpName}`;
        }

        // 3. Handle Obsidian-style images ![[image.png]]
        content = content.replace(/!\[\[(.*?)\]\]/g, (match, fileName) => {
            const webpPath = imageMap[fileName] || imageMap[path.basename(fileName)];
            if (webpPath) {
                return `<img src="${webpPath}" alt="${fileName}" class="article-image">`;
            }
            return match; // Keep as is if image not found
        });

        // 4. Convert Markdown to HTML
        const htmlContent = md.render(content);

        // 5. Update posts.json
        const posts = JSON.parse(await fs.readFile(POSTS_FILE, 'utf-8'));

        // Generate new ID
        const newId = posts.length > 0 ? Math.max(...posts.map(p => p.id)) + 1 : 1;

        const newPost = {
            id: newId,
            title: frontMatter.title || 'Untitled',
            category: frontMatter.category || 'Uncategorized',
            tags: frontMatter.tags || [],
            date: frontMatter.date || new Date().toISOString(),
            excerpt: frontMatter.excerpt || '',
            content: htmlContent,
            image: imageMap[frontMatter.image] || frontMatter.image || ''
        };

        posts.unshift(newPost); // Add to beginning
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
