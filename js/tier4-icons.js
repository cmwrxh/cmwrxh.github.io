// Tier 4 card icon treatment
// Keeps icons lightweight and dependency-free while matching the site's restrained visual system.
document.addEventListener('DOMContentLoaded', () => {
  const icons = [
    { name: 'discover', label: 'Discover and measure', path: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path><path d="M11 8v6"></path><path d="M8 11h6"></path>' },
    { name: 'diagnose', label: 'Compare and diagnose', path: '<path d="M4 19V5"></path><path d="M4 19h16"></path><path d="m7 15 3-4 3 2 5-7"></path>' },
    { name: 'recommend', label: 'Recommend fixes', path: '<path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path>' },
    { name: 'validate', label: 'Validate improvements', path: '<path d="m5 12 4 4L19 6"></path>' }
  ];

  document.querySelectorAll('.process-cards .process-card').forEach((card, index) => {
    if (card.querySelector('.card-icon')) return;
    const icon = icons[index];
    if (!icon) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'card-icon';
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.setAttribute('title', icon.label);
    wrapper.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icon.path}</svg>`;
    card.prepend(wrapper);
  });
});
