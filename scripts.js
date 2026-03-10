// Theme Management
const themeToggle = document.getElementById('theme-toggle');
const currentTheme = localStorage.getItem('theme') || 'dark'; // Use dark by default as per previous context or preference

function updateThemeIcon() {
    if (!themeToggle) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeToggle.innerHTML = isDark
        ? `<i data-lucide="sun"></i>`
        : `<i data-lucide="moon"></i>`;
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// Initial set
if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
} else {
    document.documentElement.removeAttribute('data-theme');
}

// Update icon on load
document.addEventListener('DOMContentLoaded', () => {
    updateThemeIcon();
});

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
        updateThemeIcon();
    });
}

// Mobile Menu Logic
const menuToggle = document.getElementById('menu-toggle');
const navLinks = document.getElementById('nav-links');

// Create Overlay
const overlay = document.createElement('div');
overlay.className = 'nav-overlay';
document.body.appendChild(overlay);

function toggleMenu() {
    const isActive = navLinks.classList.toggle('active');
    overlay.classList.toggle('active');
    document.body.style.overflow = isActive ? 'hidden' : '';

    if (menuToggle) {
        menuToggle.innerHTML = isActive
            ? `<i data-lucide="x"></i>`
            : `<i data-lucide="menu"></i>`;
        if (window.lucide) window.lucide.createIcons();
    }
}

if (menuToggle) {
    menuToggle.innerHTML = `<i data-lucide="menu"></i>`;
    menuToggle.addEventListener('click', toggleMenu);
}

overlay.addEventListener('click', toggleMenu);

// Handle mobile category toggle and search
document.addEventListener('DOMContentLoaded', () => {
    // 1. Mobile Category Accordion
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 900) {
            const trigger = e.target.closest('.dropdown-trigger');
            if (trigger) {
                const dropdown = trigger.closest('.nav-dropdown');
                if (dropdown) {
                    e.preventDefault();
                    dropdown.classList.toggle('mobile-open');
                }
            }

            // Close menu when clicking a link (except category trigger)
            if (e.target.tagName === 'A' && !e.target.closest('.dropdown-trigger')) {
                if (navLinks.classList.contains('active')) {
                    toggleMenu();
                }
            }
        }
    });

    // 2. Inject Mobile Search
    if (window.innerWidth <= 900 && navLinks && !document.querySelector('.mobile-search')) {
        const searchWrapper = document.createElement('div');
        searchWrapper.className = 'mobile-search';
        searchWrapper.innerHTML = `<input type="text" placeholder="Search articles..." id="mobile-search-input">`;
        navLinks.prepend(searchWrapper);

        const mobileSearchInput = document.getElementById('mobile-search-input');
        if (mobileSearchInput) {
            mobileSearchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase();
                // Reuse existing search logic by triggering input on main search
                const mainSearch = document.getElementById('search-input');
                if (mainSearch) {
                    mainSearch.value = query;
                    mainSearch.dispatchEvent(new Event('input'));
                }
            });
        }
    }
});

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
        const response = await fetch('/posts.json');
        blogPosts = await response.json();

        // 1. Always render global components
        renderNavCategories();
        renderFooterCategories();
        updateThemeIcon();

        // 2. Identify current page
        const path = window.location.pathname;
        const isPostPage = path.includes('/post/');
        // Stricter home page check: It's home if it's the root OR index.html AND NOT in a subfolder like /post/
        const isHomePage = (path === '/' || path.endsWith('/index.html') || path === '') && !isPostPage;

        if (isPostPage) {
            renderSinglePostFromSlug();
        } else if (isHomePage) {
            const params = new URLSearchParams(window.location.search);
            const categoryFilter = params.get('category');

            if (categoryFilter) {
                filterByCategory(categoryFilter, false);
            } else {
                renderFeaturedPost(blogPosts[0]);
                renderPosts(blogPosts.slice(1));
                renderCategorySections();
            }
        }
    } catch (error) {
        console.error('Error loading blog posts:', error);
    }
}

function renderNavCategories() {
    const navCategories = document.getElementById('nav-categories');
    if (!navCategories) return;

    const categories = [...new Set(blogPosts.map(post => post.category))];

    if (categories.length > 0) {
        navCategories.innerHTML = `
            <div class="nav-dropdown">
                <button class="dropdown-trigger">Categories <i data-lucide="chevron-down"></i></button>
                <div class="dropdown-content">
                    ${categories.map(cat => `<a href="/?category=${encodeURIComponent(cat)}">${cat}</a>`).join('')}
                </div>
            </div>
        `;
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }
}

function renderCategorySections() {
    const container = document.getElementById('category-sections');
    if (!container) return;

    const categories = [...new Set(blogPosts.map(post => post.category))];

    container.innerHTML = categories.map(category => {
        const categoryPosts = blogPosts.filter(post => post.category === category).slice(0, 3);
        const categoryId = `category-${category.toLowerCase().replace(/ & /g, '-').replace(/\s+/g, '-')}`;

        return `
            <section id="${categoryId}" class="category-section" style="margin-top: 6rem; padding-top: 4rem; border-top: 1px solid var(--border);">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2rem;">
                    <h2 style="margin-bottom: 0;">${category}</h2>
                    <a href="?category=${encodeURIComponent(category)}" class="view-all" onclick="filterByCategory('${category}'); return false;">View All ${category}</a>
                </div>
                <div class="article-grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));">
                    ${categoryPosts.map(post => `
                        <article class="article-card">
                            <a href="/post/?${post.slug}">
                                <img src="/${post.image}" alt="${post.title}" class="cover-image" style="aspect-ratio: 16/9;">
                                <h3>${post.title}</h3>
                                <p style="font-size: 0.95rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${post.excerpt}</p>
                            </a>
                        </article>
                    `).join('')}
                </div>
            </section>
        `;
    }).join('');
}



function renderFooterCategories() {
    const footerContainer = document.getElementById('footer-categories');
    if (!footerContainer) return;

    const categories = [...new Set(blogPosts.map(post => post.category))];
    if (categories.length > 0) {
        footerContainer.innerHTML = `
            <h3>Categories</h3>
            <ul class="footer-category-list">
                ${categories.map(cat => `<li><a href="/?category=${encodeURIComponent(cat)}" onclick="filterByCategory('${cat}'); return false;">${cat}</a></li>`).join('')}
            </ul>
        `;
    }
}

window.filterByCategory = function (category, shouldScroll = true) {
    const postsContainer = document.getElementById('posts-container');

    // If we're not on the listing page, redirect to it
    if (!postsContainer) {
        window.location.href = `/?category=${encodeURIComponent(category)}`;
        return;
    }

    const featuredSection = document.getElementById('featured-post');
    const categorySections = document.getElementById('category-sections');
    const allArticlesHeader = document.getElementById('main-heading');

    if (featuredSection) featuredSection.style.display = 'none';
    if (categorySections) categorySections.style.display = 'none';
    if (allArticlesHeader) {
        allArticlesHeader.textContent = category;
    }

    const filtered = blogPosts.filter(post => post.category === category);
    renderPosts(filtered);

    // Update URL state
    const params = new URLSearchParams(window.location.search);
    if (params.get('category') !== category) {
        const newUrl = window.location.pathname.replace('index.html', '') + '?category=' + encodeURIComponent(category);
        window.history.pushState({ category: category }, '', newUrl);
    }

    // Scroll to the top of the filtered items
    if (shouldScroll) {
        const scrollTarget = allArticlesHeader || postsContainer;
        if (scrollTarget) {
            window.scrollTo({ top: scrollTarget.offsetTop - 120, behavior: 'smooth' });
        }
    }
};

function renderPosts(posts) {
    const container = document.getElementById('posts-container');
    if (!container) return;

    if (posts.length === 0) {
        container.innerHTML = '<p>No articles found for this selection.</p>';
        return;
    }

    container.innerHTML = posts.map(post => `
        <article class="article-card">
            <a href="/post/?${post.slug}">
                <img src="/${post.image}" alt="${post.title}" class="cover-image">
                <span class="accent-tag">${post.category}</span>
                <h3>${post.title}</h3>
                <p>${post.excerpt}</p>
                <small>${getRelativeDate(post.date)} • ${post.tags.join(', ')}</small>
            </a>
        </article>
    `).join('');
}

function renderSinglePostFromSlug() {
    const params = new URLSearchParams(window.location.search);
    const pathParts = window.location.pathname.split('/').filter(p => p !== '');

    // Check if slug is in the path (/post/some-slug)
    let slugFromPath = null;
    if (pathParts.length > 1 && pathParts[0] === 'post') {
        slugFromPath = pathParts[1] === 'index.html' ? null : pathParts[1];
    }

    // Check if slug is in the search (?some-slug)
    const slugFromQuery = window.location.search.substring(1).split('&')[0];

    const slug = slugFromPath || slugFromQuery;
    const post = blogPosts.find(p => p.slug === slug || p.id.toString() === slug);

    if (post) {
        renderSinglePost(post);
    } else {
        document.getElementById('post-content').innerHTML = `
            <div class="content-narrow" style="text-align: center; margin-top: 6rem;">
                <h1>Post not found</h1>
                <p>We couldn't find the article you're looking for.</p>
                <a href="/" class="btn" style="display: inline-block; margin-top: 2rem;">Back to Home</a>
            </div>
        `;
    }
}

function renderSinglePost(post) {
    if (!post) return;

    document.title = `${post.title} | Md Abu Bakkar Siddik Hamim`;

    const container = document.getElementById('post-content');
    if (container) {
        container.innerHTML = `
            <div class="content-narrow">
                <span class="accent-tag">${post.category}</span>
                <h1 class="post-title">${post.title}</h1>
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; color: var(--text-secondary);">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: #ccc; overflow: hidden;">
                        <img src="/photos/self.webp" alt="Md Abu Bakkar Siddik Hamim" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <div>
                        <strong>Md Abu Bakkar Siddik Hamim</strong><br>
                        <small>${getRelativeDate(post.date)}</small>
                    </div>
                </div>
                ${post.image ? `<img src="/${post.image}" alt="${post.title}" class="post-hero-image">` : ''}
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
            <a href="/post/?${post.slug}">
                <img src="/${post.image}" alt="${post.title}" class="cover-image" style="aspect-ratio: 4/3;">
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
            <a href="/post/?${post.slug}">
                <img src="/${post.image}" alt="${post.title}" class="cover-image">
            </a>
            <div>
                <span class="accent-tag">${post.category}</span>
                <h2><a href="/post/?${post.slug}">${post.title}</a></h2>
                <p>${post.excerpt}</p>
                <div class="featured-author">
                    <img src="/photos/self.webp" alt="Md Abu Bakkar Siddik Hamim">
                    <small>By Md Abu Bakkar Siddik Hamim • ${getRelativeDate(post.date)}</small>
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
        const categorySections = document.getElementById('category-sections');
        const allArticlesHeader = document.querySelector('h2');

        if (query.trim() !== '') {
            if (featuredSection) featuredSection.style.display = 'none';
            if (categorySections) categorySections.style.display = 'none';
            if (allArticlesHeader) allArticlesHeader.textContent = 'Search Results';
        } else {
            if (featuredSection) featuredSection.style.display = 'block';
            if (categorySections) categorySections.style.display = 'block';
            if (allArticlesHeader) allArticlesHeader.textContent = 'All Articles';
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
