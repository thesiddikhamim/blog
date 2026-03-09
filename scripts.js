// Theme Management
const themeToggle = document.getElementById('theme-toggle');
const currentTheme = localStorage.getItem('theme') || 'light';

if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
}

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        let theme = document.documentElement.getAttribute('data-theme');
        if (theme === 'dark') {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        }
    });
}

// Mobile Menu Logic
const menuToggle = document.getElementById('menu-toggle');
const navLinks = document.getElementById('nav-links');

if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        menuToggle.textContent = navLinks.classList.contains('active') ? '✕' : '☰';
    });
}

// Relative Date Helper
function getRelativeDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;

    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// Data Fetching and Search
let blogPosts = [];

async function initBlog() {
    try {
        const response = await fetch('posts.json');
        blogPosts = await response.json();

        // Initial render based on page
        const path = window.location.pathname;
        if (path.endsWith('index.html') || path === '/' || path.endsWith('/')) {
            renderFeaturedPost(blogPosts[0]);
            renderPosts(blogPosts.slice(1));
        } else if (path.endsWith('post.html')) {
            renderSinglePost();
        }
    } catch (error) {
        console.error('Error loading blog posts:', error);
    }
}

function renderPosts(posts) {
    const container = document.getElementById('posts-container');
    if (!container) return;

    container.innerHTML = posts.map(post => `
        <article class="article-card">
            <a href="post.html?id=${post.id}">
                <img src="${post.image}" alt="${post.title}" class="cover-image">
                <span class="accent-tag">${post.category}</span>
                <h3>${post.title}</h3>
                <p>${post.excerpt}</p>
                <small>${getRelativeDate(post.date)} • ${post.tags.join(', ')}</small>
            </a>
        </article>
    `).join('');
}

function renderSinglePost() {
    const params = new URLSearchParams(window.location.search);
    const id = parseInt(params.get('id'));
    const post = blogPosts.find(p => p.id === id);

    if (!post) {
        document.getElementById('post-content').innerHTML = '<h1>Post not found</h1>';
        return;
    }

    document.title = `${post.title} | Siddik Hamim`;

    const container = document.getElementById('post-content');
    if (container) {
        container.innerHTML = `
            <div class="content-narrow">
                <span class="accent-tag">${post.category}</span>
                <h1 class="post-title">${post.title}</h1>
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; color: var(--text-secondary);">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: #ccc; overflow: hidden;">
                        <img src="https://ui-avatars.com/api/?name=Siddik+Hamim&background=111&color=fff" alt="Siddik Hamim" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <div>
                        <strong>Siddik Hamim</strong><br>
                        <small>${getRelativeDate(post.date)}</small>
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
            
            <section style="margin-top: 6rem;">
                <h2>Related Posts</h2>
                <div class="article-grid" style="grid-template-columns: repeat(3, 1fr);">
                    ${renderRelatedPosts(post)}
                </div>
            </section>
        `;

        // Process all links to open in new tab and handle footnotes
        const articleLinks = container.querySelectorAll('.article-body a');
        articleLinks.forEach(link => {
            // 1. External links open in new tab
            if (link.hostname !== window.location.hostname && link.hostname !== '') {
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
            }

            // 2. Footnote smooth scroll and highlight
            if (link.classList.contains('footnote-ref') || link.classList.contains('footnote-backref')) {
                link.addEventListener('click', (e) => {
                    const targetId = link.getAttribute('href').substring(1);
                    const targetElement = document.getElementById(targetId);

                    if (targetElement) {
                        // Apply unique highlight class based on direction
                        const highlightClass = link.classList.contains('footnote-ref') ? 'footnote-target-highlight' : 'footnote-ref-highlight';

                        targetElement.classList.add(highlightClass);

                        // Remove after animation (2.5s to be safe)
                        setTimeout(() => {
                            targetElement.classList.remove(highlightClass);
                        }, 2500);
                    }
                });
            }
        });

        // 3. Make the whole footnote list item clickable to go back to source
        const footnoteItems = container.querySelectorAll('.footnote-item');
        footnoteItems.forEach(item => {
            item.addEventListener('click', (e) => {
                // If they clicked the back-arrow specifically, don't do it twice
                if (e.target.classList.contains('footnote-backref')) return;

                const backRefLink = item.querySelector('.footnote-backref');
                if (backRefLink) {
                    backRefLink.click();
                }
            });
        });
    }
}



function renderRelatedPosts(currentPost) {
    const related = blogPosts
        .filter(p => p.id !== currentPost.id && (p.category === currentPost.category || p.tags.some(t => currentPost.tags.includes(t))))
        .slice(0, 3);

    return related.map(post => `
        <article class="article-card">
            <a href="post.html?id=${post.id}">
                <img src="${post.image}" alt="${post.title}" class="cover-image" style="aspect-ratio: 4/3;">
                <h3>${post.title}</h3>
            </a>
        </article>
    `).join('');
}

function renderFeaturedPost(post) {
    const container = document.getElementById('featured-post');
    if (!container || !post) return;

    container.innerHTML = `
        <article class="featured-card">
            <a href="post.html?id=${post.id}">
                <img src="${post.image}" alt="${post.title}" class="cover-image">
            </a>
            <div>
                <span class="accent-tag">${post.category}</span>
                <h2><a href="post.html?id=${post.id}">${post.title}</a></h2>
                <p>${post.excerpt}</p>
                <div class="featured-author">
                    <img src="https://ui-avatars.com/api/?name=Siddik+Hamim&background=111&color=fff" alt="Siddik Hamim">
                    <small>By Siddik Hamim • ${getRelativeDate(post.date)}</small>
                </div>
            </div>
        </article>
    `;
}

// Search Functionality
const searchInput = document.getElementById('search-input');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const featuredSection = document.getElementById('featured-post');

        if (query.trim() !== '') {
            if (featuredSection) featuredSection.style.display = 'none';
        } else {
            if (featuredSection) featuredSection.style.display = 'block';
        }

        const filtered = blogPosts.filter(post =>
            post.title.toLowerCase().includes(query) ||
            post.excerpt.toLowerCase().includes(query) ||
            post.category.toLowerCase().includes(query)
        );
        renderPosts(filtered);
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', initBlog);
