/**
 * Onboarding Shell
 * 
 * This module controls the boot screen and onboarding overlay.
 * The Dashboard (force graph, panels, dossier) is NEVER unmounted or recreated.
 * Only the overlay z-index and opacity are controlled here.
 */

(function() {
  'use strict';

  // Check if onboarding has been completed before
  const ONBOARDING_KEY = 'msc_onboarding_complete';

  // DOM Elements
  const bootScreen = document.getElementById('bootScreen');
  const bootLog = document.getElementById('bootLog');
  const bootEnter = document.getElementById('bootEnter');
  const onboardingOverlay = document.getElementById('onboardingOverlay');
  const carouselTrack = document.getElementById('carouselTrack');
  const carouselNext = document.getElementById('carouselNext');
  const carouselBack = document.getElementById('carouselBack');
  const dots = document.querySelectorAll('.footer-right-dots .dot');

  let currentPage = 1;
  const totalPages = 5;

  // Boot sequence logs
  const bootLogs = [
    'Loading Mythological Database...',
    'Loading Personnel Archive...',
    'Loading Department Network...',
    'Verifying Credentials...',
  ];

  /**
   * Simulate boot sequence with progressive loading
   */
  function runBootSequence() {
    let logIndex = 0;
    const progressBlocks = document.querySelectorAll('.progress-block');

    function nextLog() {
      if (logIndex < bootLogs.length) {
        // Update progress blocks
        progressBlocks.forEach((block, i) => {
          block.classList.toggle('active', i <= logIndex);
        });

        // Add log line
        const logLine = document.createElement('p');
        logLine.className = 'log-line';
        logLine.textContent = bootLogs[logIndex];
        bootLog.appendChild(logLine);

        logIndex++;
        setTimeout(nextLog, 400 + Math.random() * 200);
      } else {
        // All logs done, show enter button
        progressBlocks.forEach(block => block.classList.add('active'));
        bootEnter.style.opacity = '1';
        bootEnter.style.pointerEvents = 'auto';
      }
    }

    nextLog();
  }

  /**
   * Transition from boot screen to onboarding
   */
  function enterOnboarding() {
    bootScreen.classList.add('hidden');

    // After boot screen fades, show onboarding
    setTimeout(() => {
      bootScreen.style.display = 'none';
      onboardingOverlay.style.display = 'flex';
      document.body.classList.add('onboarding-active');
      currentPage = 1;
      updateCarousel();
    }, 500);
  }

  /**
   * Update carousel position and indicators
   */
  function updateCarousel() {
    // Move track
    const offset = (currentPage - 1) * -100;
    carouselTrack.style.transform = `translateX(${offset}%)`;

    // Update dots
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === currentPage - 1);
    });

    // Update buttons
    carouselBack.style.visibility = currentPage > 1 ? 'visible' : 'hidden';
    carouselNext.textContent = currentPage === totalPages ? '[ACCESS INTERNAL NETWORK]' : '[NEXT]';
    carouselNext.classList.toggle('large', currentPage === totalPages);
    document.querySelector('.footer-right').classList.toggle('large', currentPage === totalPages);
  }

  /**
   * Go to next page
   */
  function nextPage() {
    if (currentPage < totalPages) {
      currentPage++;
      updateCarousel();
    } else {
      // Final page - complete onboarding
      completeOnboarding();
    }
  }

  /**
   * Go to previous page
   */
  function prevPage() {
    if (currentPage > 1) {
      currentPage--;
      updateCarousel();
    }
  }

  /**
   * Complete onboarding and reveal dashboard
   */
  function completeOnboarding() {
    // Mark as completed
    sessionStorage.setItem(ONBOARDING_KEY, 'true');

    // Remove dimming from dashboard
    document.body.classList.remove('onboarding-active');

    // Fade out overlay
    onboardingOverlay.classList.add('hidden');

    // Remove overlay after transition
    setTimeout(() => {
      onboardingOverlay.style.display = 'none';
    }, 600);
  }

  /**
   * Initialize onboarding system
   */
  function init() {
    // If onboarding already completed this session, skip
    if (sessionStorage.getItem(ONBOARDING_KEY) === 'true') {
      bootScreen.style.display = 'none';
      onboardingOverlay.style.display = 'none';
      return;
    }

    // Start boot sequence
    runBootSequence();

    // Attach event listeners
    bootEnter.addEventListener('click', enterOnboarding);
    carouselNext.addEventListener('click', nextPage);
    carouselBack.addEventListener('click', prevPage);

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (onboardingOverlay.style.display === 'flex') {
        if (e.key === 'ArrowRight' || e.key === 'Enter') {
          nextPage();
        } else if (e.key === 'ArrowLeft') {
          prevPage();
        }
      }
    });
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
