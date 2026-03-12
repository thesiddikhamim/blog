# Hamim — A Scholar's Digital Notebook 🖋️

[![MIT License](https://img.shields.io/badge/License-MIT-black.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-black.svg)](http://makeapullrequest.com)

A minimalist, multi-page blogging platform designed for intellectual depth and calm reflection. Focused on **Economics, Politics, Philosophy, and Ideas**, this blog combines a classic editorial aesthetic with modern, responsive functionality.

---

## ✨ Key Features

-   🌒 **Adaptive Dark Mode**: A premium, eye-friendly reading experience that switches automatically or manually.
-   📱 **Drawer-Style Mobile Navigation**: A fluid, responsive menu with an overlay backdrop, optimized for smartphone reading.
-   🔍 **Instant SEARCH**: A global search system that allows readers to find articles by title or content in real-time.
-   📂 **Deep Category Filtering**: Curated sections for specific topics with dynamic URL persistence for easy sharing.
-   📐 **Minimalist Editorial Design**: High-contrast typography and a clean layout inspired by premium academic journals.
-   ⚡ **JSON-Driven Content**: No complex database needed—articles are managed easily through a structured JSON file.

---

## 🛠️ Built With

![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23F7DF1E.svg?style=for-the-badge&logo=javascript&logoColor=black)
![Lucide](https://img.shields.io/badge/Lucide_Icons-black?style=for-the-badge&logo=feather&logoColor=white)

---

## 🚀 Getting Started

To run this project locally:

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/thesiddikhamim/blog.git
    cd blog
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Run with Live Server**
    You can use any local server (VS Code Live Server extension, `python3 -m http.server`, etc.) to view the site at `localhost`.

4.  **Local Node Server (Optional)**
    If a `server.js` is present:
    ```bash
    node server.js
    ```

---

## ✍️ Content Management

Adding new articles is simple. Just update the `posts.json` file in the root directory:

```json
{
  "id": 1,
  "title": "Your New Article Title",
  "category": "Philosophy & Ideas",
  "date": "2026-03-10",
  "excerpt": "A brief summary for the homepage...",
  "content": "Full article content in HTML format...",
  "image": "path/to/image.jpg"
}
```

---

## 📂 Project Structure

-   `index.html`: The gateway to all current and featured articles.
-   `post.html`: Template for individual, distraction-free reading.
-   `about.html` & `contact.html`: Static pages for personal branding.
-   `scripts.js`: The engine behind search, filtering, and theme management.
-   `index.css`: Custom-designed design system and typography.

---

## 👤 Author

**Md Abu Bakkar Siddik Hamim**  
*Still Thinking*

---

© 2026 Md Abu Bakkar Siddik Hamim. All rights reserved.