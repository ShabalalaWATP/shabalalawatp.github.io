// Animated Counter
function animateCounter(id, start, end, duration) {
    let obj = document.getElementById(id);
    let current = start;
    let range = end - start;
    let increment = end > start ? 1 : -1;
    let stepTime = Math.abs(Math.floor(duration / range));
    
    let timer = setInterval(function() {
        current += increment;
        obj.innerHTML = current.toLocaleString();
        if (current == end) {
            clearInterval(timer);
        }
    }, stepTime);
}

// Initialize counters on page load - skip to final values
window.onload = function() {
    // Set counters directly to 1 year values
    document.getElementById("days").innerHTML = "365";
    document.getElementById("hours").innerHTML = "8,760";
    document.getElementById("minutes").innerHTML = "525,600";
    
    // Update timeline progress on scroll
    updateTimelineProgress();
};

// Smooth scroll to timeline
function startJourney() {
    document.getElementById('timeline').scrollIntoView({ behavior: 'smooth' });
}

// Update timeline progress based on scroll
function updateTimelineProgress() {
    window.addEventListener('scroll', () => {
        const timeline = document.querySelector('.timeline');
        const timelineProgress = document.querySelector('.timeline-progress');
        const timelineRect = timeline.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        
        let progress = 0;
        if (timelineRect.top < windowHeight && timelineRect.bottom > 0) {
            const visible = Math.min(windowHeight, timelineRect.bottom) - Math.max(0, timelineRect.top);
            progress = (visible / timelineRect.height) * 100;
        }
        
        timelineProgress.style.height = `${Math.min(progress, 100)}%`;
    });
}

// Gallery modal functions
function openGallery(imgElement) {
    const modal = document.getElementById('galleryModal');
    const modalImg = document.getElementById('modalImage');
    const img = imgElement.querySelector('img');
    
    modal.style.display = "block";
    modalImg.src = img.src.replace('w=400', 'w=1200');
}

function closeGallery() {
    document.getElementById('galleryModal').style.display = "none";
}

// Close modal on click outside
window.onclick = function(event) {
    const modal = document.getElementById('galleryModal');
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

// Add parallax effect to hero section
document.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const heroContent = document.querySelector('.hero-content');
    const heroOverlay = document.querySelector('.hero-overlay');
    
    if (heroContent) {
        heroContent.style.transform = `translateY(${scrolled * 0.5}px)`;
        heroContent.style.opacity = 1 - (scrolled * 0.002);
    }
    
    if (heroOverlay) {
        heroOverlay.style.transform = `translateY(${scrolled * 0.3}px)`;
    }
});

// Add floating animation to event cards on hover
document.querySelectorAll('.event-card').forEach(card => {
    card.addEventListener('mouseenter', function() {
        this.style.animation = 'float-card 2s ease-in-out infinite';
    });
    
    card.addEventListener('mouseleave', function() {
        this.style.animation = 'fadeInUp 0.8s forwards';
    });
});

// Add keyframe for float-card animation
const style = document.createElement('style');
style.textContent = `
    @keyframes float-card {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-10px); }
    }
`;
document.head.appendChild(style);

// Create dynamic floating hearts
function createHeart() {
    const heart = document.createElement('div');
    heart.className = 'heart';
    heart.style.left = Math.random() * 100 + '%';
    heart.style.animationDuration = Math.random() * 3 + 7 + 's';
    heart.style.opacity = Math.random() * 0.1 + 0.05;
    
    document.querySelector('.floating-hearts').appendChild(heart);
    
    setTimeout(() => {
        heart.remove();
    }, 10000);
}

// Generate hearts periodically
setInterval(createHeart, 3000);
