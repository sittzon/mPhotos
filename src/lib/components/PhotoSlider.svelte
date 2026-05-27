<script lang="ts">
  import { onMount, onDestroy  } from "svelte";
  import type { PhotoModel }from "$api";
  import ThumbnailStrip from '$components/ThumbnailStrip.svelte';
  import { slide } from 'svelte/transition';

  export let photos: Array<PhotoModel> = [];
  export let closeModal = () => {}; // Feedback close to parent
  export let photoIndex: number = 0; // Start index in photos array
  export let nrToPreload: number = 1; // Number of photos to preload on each side

  let currentIndex = photoIndex;
  $: preloadIndexes = Array.from({ length: nrToPreload * 2 + 1 }, (_, i) => wrap(currentIndex - nrToPreload + i));
  $: preloadPhotos = preloadIndexes.map(i => photos[i]);

  // Reactive array of transform strings — recalculated when any dependency changes
  $: transforms = preloadPhotos.map((photo, i) => {
    const relIndex = i - nrToPreload; // 0 for current, negative = left, positive = right
    const offset = relIndex * (viewportWidth + 10); // px offset from center

    if (i === nrToPreload) {
      // current slide uses scale / translateX / translateY / rotate and diffX/diffY
      // ensure px units are present
      return `scale(${scale}) translateX(${-diffX + translateX}px) translateY(${-diffY + translateY}px) rotate(${rotate}deg)`;
    } else {
      // other slides: keep them at scale 1 and only offset horizontally
      return `scale(1) translateX(${-diffX + offset}px)`;
    }
  });

  let isVideoPlaying: boolean = false;

  $: viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
  let isDetailsShown: boolean = false;
  let slideshowOpacity = 1; // Opacity of entire slideshow, used when dragging up/down to close
  const amountOfPixelsToClose = 100; // Pixels to drag before closing
  const amountOfPixelsForFadeout = 150; // Pixels to drag until opacity 100%
  const amountOfPixelsToActivateFade = 20; // Pixels to drag before begin fading
  const amountOfPixelsToSwitchPhoto = 50; // Pixels to drag before switching photo

  onMount(() => {
    currentIndex = photoIndex;
    document.addEventListener("keyup", keyPressUp);
    window.addEventListener("resize", handleResize);
    
    // Show elements again immediately on user action
    ['click', 'touchstart', 'mousemove'].forEach(event => {
      document.addEventListener(event, () => {
        const els = document.getElementsByClassName('fadeout') as HTMLCollectionOf<HTMLElement>;
        const els5s = document.getElementsByClassName('fadeout5s') as HTMLCollectionOf<HTMLElement>;
        Array.from(els).forEach(el => {
          el.style.opacity = '1';  // instantly show
          resetFade(el);           // restart fade timer
        });
        Array.from(els5s).forEach(el => {
          el.style.opacity = '1';  // instantly show
          resetFade5s(el);         // restart fade timer
        });
      });
    });
  });

  onDestroy(() => {
    window.removeEventListener("resize", handleResize);
    document.removeEventListener("keyup", keyPressUp);
  });

  // Helper to wrap index around
  const wrap = (i: number) => (i + photos.length) % photos.length;
  
  const resetFade = (el: HTMLElement) => {
    // Reset the animation by removing and re-adding the class
    el.classList.remove('fadeout');
    void el.offsetWidth; // forces reflow so the animation can restart
    el.classList.add('fadeout');
  }
  
  const resetFade5s = (el: HTMLElement) => {
    // Reset the animation by removing and re-adding the class
    el.classList.remove('fadeout5s');
    void el.offsetWidth; // forces reflow so the animation can restart
    el.classList.add('fadeout5s');
  }
  
  const keyPressUp = (key: KeyboardEvent) => {
    // console.log(key.code)
    // Reset fade for fadeout5s
    const els5s = document.getElementsByClassName('fadeout5s') as HTMLCollectionOf<HTMLElement>;
    Array.from(els5s).forEach(el => {
      el.style.opacity = '1';  // instantly show
      resetFade5s(el);         // restart fade timer
    });
    
    if (key.code=='ArrowRight') {
      next();
    }
    if (key.code=='ArrowLeft') {
      prev();
    }
    if (key.code=='Escape') {
      resetSlider();
      closeModal();
    }
    if (key.code=='Space') {
      resetSlider();
      closeModal();
    }
    if (key.code=='KeyI') {
      isDetailsShown = !isDetailsShown;
    }
    if (key.code=='KeyF') {
      setCurrentAsFavorite();
    }
  }
  
  const getDateFormattedLong = (photo: PhotoModel) => {
    if (photo == null || photo.dateTaken == null) {
      return "";
    }
    // error-no-date-found
    if (photo.dateTaken.split(' ')[1] == null) {
      return photo.dateTaken.split(' ')[0];
    }
    
    return photo.dateTaken;
  }
  
  const next = () => {
    isVideoPlaying = false;
    scale = 1; // Reset scale on photo change
    translateX = 0;
    translateY = 0;
    lastTranslateX = 0;
    lastTranslateY = 0;
    currentIndex = wrap(currentIndex + 1);
  }
  
  const prev = () => {
    isVideoPlaying = false;
    scale = 1; // Reset scale on photo change
    translateX = 0;
    translateY = 0;
    lastTranslateX = 0;
    lastTranslateY = 0;
    currentIndex = wrap(currentIndex - 1);
  }
  
  // Touch handling
  let startX = 0;
  let startY = 0;
  let diffX = 0; // For swiping between photos
  let diffY = 0; // For swiping between photos
  let rotate = 0; // For rotating when dragging up/down
  let startDistance = 0; // For pinch to zoom
  let scale = 1; // For pinch to zoom
  let lastScale = 1; // For pinch to zoom
  let translateX = 0; // For panning when zoomed
  let translateY = 0; // For panning when zoomed
  let lastTranslateX = 0; // For panning when zoomed
  let lastTranslateY = 0; // For panning when zoomed
  let animating = false; // Whether an animation is in progress
  let changingSlide = false; // Whether we are in the process of changing slide
  let closingSlide = false; // Whether we are in the process of closing slide
  let closeOnTouchEnd = false; // Whether to close modal on touch end
  let nextOnTouchEnd = false; // Whether to go to next photo on touch end
  let prevOnTouchEnd = false; // Whether to go to previous photo on touch end
  let hasSwitchedDetailsInfo = false; // To prevent multiple toggles of info on single swipe

  const getDistance = (touches: TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  const onTouchStart = (e: TouchEvent) => {
    animating = false;

    // Enable pinch to zoom on current photo
    if (e.touches.length === 2)
    {
      startDistance = getDistance(e.touches);
      lastScale = scale;
    }
    else if (e.touches.length === 1) {
      startX = e.touches[0].clientX - lastTranslateX;
      startY = e.touches[0].clientY - lastTranslateY;
    }
  }

  const onTouchMove = (e: TouchEvent) => {
    // Disable video playing on touch move
    isVideoPlaying = false;

    // Pinch-to-zoom on current photo
    if (e.touches.length === 2) {
      const distance = getDistance(e.touches);
      scale = Math.min(Math.max(lastScale * (distance / startDistance), 1), 4);
      // Replace current photo src with fullsize img
      // currentPhoto.src = photos[currentIndex].full?? photos[currentIndex].medium;
    }
    // One finger, drag to pan
    else if (e.touches.length === 1 && scale > 1.05)
    {
      translateX = Math.min(Math.max(e.touches[0].clientX - startX, -200), 200);
      translateY = Math.min(Math.max(e.touches[0].clientY - startY, -200), 200);
      translateX /= 2; // Slow down panning
      translateY /= 2;
    }
    // One finger, swipe to change photo, down to close, up to show info
    else
    {
      diffX = startX + lastTranslateX - e.touches[0].clientX;
      diffY = startY + lastTranslateY - e.touches[0].clientY;

      nextOnTouchEnd = false;
      prevOnTouchEnd = false;
      if (changingSlide) {
        diffY = 0; // No vertical movement when changing slide
      }
      else if (closingSlide) {
        diffX = 0; // No horizontal movement when closing slide
      }
      // Go to next/prev photo if beyond threshold
      if (!closingSlide && diffX > amountOfPixelsToSwitchPhoto) {
        changingSlide = true;
        nextOnTouchEnd = true;
      } else if (!closingSlide && diffX < -amountOfPixelsToSwitchPhoto) {
        changingSlide = true;
        prevOnTouchEnd = true;
      }
      // Drag down to close
      if(!changingSlide && Math.abs(diffY) > amountOfPixelsToActivateFade && diffY < amountOfPixelsToActivateFade) {
        isDetailsShown = false;
        // Start dragging photo up to close
        closingSlide = true;
        scale = 1 - Math.abs(diffY)/1000;
        rotate = diffY/20;
        const scaleFactor = 1.5; // above 1 to make fade slower
        slideshowOpacity = scaleFactor * (amountOfPixelsForFadeout - Math.abs(diffY)) / amountOfPixelsForFadeout;
        if(Math.abs(diffY) > amountOfPixelsToClose) {
          closeOnTouchEnd = true;
        }
        else {
          closeOnTouchEnd = false;
        }
      }
      // Drag up to show info
      if (!changingSlide && Math.abs(diffY) > amountOfPixelsToActivateFade && diffY > amountOfPixelsToActivateFade) {
        closingSlide = true;
        if (!hasSwitchedDetailsInfo) {
          isDetailsShown = !isDetailsShown;
          hasSwitchedDetailsInfo = true;
        }
      }
    }
  }

  const onTouchEnd = () => {
    hasSwitchedDetailsInfo = false;
    diffX = 0;
    diffY = 0;
    animating = true;
    lastTranslateX = translateX;
    lastTranslateY = translateY;
    changingSlide = false;
    closingSlide = false;
    // Main photo back to center
    if (scale <= 1) {
      scale = 1;
      rotate = 0;
      translateX = 0;
      translateY = 0;
    }
    if (closeOnTouchEnd) {
      closeOnTouchEnd = false;
      lastTranslateX = 0;
      lastTranslateY = 0;
      resetSlider();
      closeModal();
    }
    else
    {
      slideshowOpacity = 1; // Reset opacity of entire slider undoing close
    }

    if (nextOnTouchEnd) {
      nextOnTouchEnd = false;
      scale = 1;
      startDistance = 0;
      lastTranslateX = 0;
      lastTranslateY = 0;
      diffX = viewportWidth+10; // To move nextPhoto to center. 
      // Switch to next photo after animation ends
      setTimeout(() => { diffX = 0; animating = false; next();}, 200);
    } else if (prevOnTouchEnd) {
      prevOnTouchEnd = false;
      scale = 1;
      startDistance = 0;
      lastTranslateX = 0;
      lastTranslateY = 0;
      diffX = -viewportWidth-10; // To move prevPhoto to center. 
      // Switch to prev photo after animation ends
      setTimeout(() => { diffX = 0; animating = false; prev();}, 200);
    }
  }

  const resetSlider = () => {
    currentIndex = 0;
    startX = 0;
    startY = 0;
    scale = 1;
    startDistance = 0;
  }

  const handleResize = () => {
    viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
  };

    // Format seconds as mm:ss
  function formatDuration(seconds: number | null): string {
      if (seconds === null) {
          return "0:00";
      }
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
  }

  const setCurrentAsFavorite = async () => {
    const currentPhoto = photos[currentIndex];
    photos[currentIndex].isFavorite = !photos[currentIndex].isFavorite;

    await fetch("/api/favorites/" + currentPhoto.guid, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        guid: currentPhoto.guid
      }),
    })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Failed to toggle favorite status");
      }
    })
  }

  const setCurrentToTrash = async () => {
    const currentPhoto = photos[currentIndex];
    photos[currentIndex].isTrash = !photos[currentIndex].isTrash;

    await fetch("/api/trash/" + currentPhoto.guid, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        guid: currentPhoto.guid
      }),
    })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Failed to toggle trash status");
      }
    })
  }
</script>

<div id="slider" on:touchstart={onTouchStart} on:touchmove={onTouchMove} on:touchend={onTouchEnd} role="navigation">
  {#if scale <= 1}
    <button class="arrow left fadeout" on:click={prev} >‹</button>
    <button class="arrow right fadeout" on:click={next} >›</button>
    <button class="close-button fadeout" on:click={() => { resetSlider(); closeModal(); }}>✖</button>

    <div class="text-rounded-corners date fadeout5s" style="opacity:{slideshowOpacity};">
      <p>{getDateFormattedLong(photos[currentIndex])}</p>
    </div>
  {/if}
    <div class="slideshow" style="opacity:{slideshowOpacity};">
      {#each preloadPhotos as photo, i}
        {#if isVideoPlaying && (photo.type === 'video' || photo.type === 'short-video') && i === nrToPreload}
          <video width="100%" height="100%" controls autoplay>
            <source 
              src={"api/video/"+photo.guid}
              type="video/mp4"
              />
            <track kind="captions" src="" srclang="en" label="English captions" default>
          </video>
        {:else}
          <img
            src={"api/photos/"+photo.guid+"/medium"}
            class="slide 
              {i === nrToPreload ? 'current' : i < nrToPreload ? 'previous' : 'next'} 
              {animating ? 'animating' : ''}
              "
            alt={photo.dateTaken}
            style="transform: {transforms[i]};"
          />
          {#if (photo.type === 'video' || photo.type === 'short-video') && !isVideoPlaying && i === nrToPreload}
            <div class="play-icon-container">
              <button 
              class="play-icon {animating ? 'animating' : ''}" 
                on:click={() => isVideoPlaying = true}
                style="transform: {transforms[i]}"
                aria-label="Play video">
              </button>
              <span 
                class="video-duration-overlay {animating ? 'animating' : ''}"
                style="transform: {transforms[i]}">
                {formatDuration(photo.lengthSeconds)}
              </span>
            </div>
          {/if}
          <div>
            <button 
              class="icon {photos[currentIndex].isFavorite ? 'favorite-checked' : 'favorite-unchecked'} fadeout" 
              on:click={() => setCurrentAsFavorite()}
              aria-label={photos[currentIndex].isFavorite ? "Unmark as favorite" : "Mark as favorite"}>
            </button>
            <button 
              class="icon {photos[currentIndex].isTrash ? 'trash-checked' : 'trash'} fadeout" 
              on:click={() => setCurrentToTrash()}
              aria-label="Move to trash">
            </button>
          </div>
        {/if}
      {/each}
    </div>
  {#if isDetailsShown}
    <div class="text-rounded-corners details" transition:slide={{duration: 200}}>
      <div>
        <b>Name:</b>
        <p>{photos[currentIndex].name}</p>
      </div>
      <div>
        <b>Resolution:</b>
        <p>{photos[currentIndex].width}x{photos[currentIndex].height} px</p>
      </div>
      <div>
        <b>Size:</b>
        <p>{photos[currentIndex].sizeKb} Kb</p>
      </div>
    </div>
  {/if}
  <!-- {#if scale <= 1 && !isVideoPlaying}
    <ThumbnailStrip
      photos={photos}
      currentIndex={currentIndex}
      visibleRange={4}
      closingSlide={closeOnTouchEnd}
      on:select={(e) => currentIndex = e.detail.index}
    />
  {/if} -->
</div>


<style>
  #slider {
    overflow: hidden;
    width: 100%;
    touch-action: pan-y;
    touch-action: pan-x;
    overflow-x: hidden;
    overflow-y: hidden;
    z-index: 10;
  }

  button {
      color: black;
      background: none;
      padding: 0;
      border: 1px solid white;
  }

  .slideshow {
    position: fixed;
    z-index: 10;
    width: 100%;
    height: 100dvh;
    overflow: hidden;
    background-color: black;
  }

  .slide {
    position: absolute;
    top: 0; 
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .current {
    z-index: 12;
  }

  .previous,
  .next {
    z-index: 11;
  }

  .animating {
    transition: transform 0.2s cubic-bezier(0.22, 0.61, 0.36, 1);
  }

  .arrow {
    box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.9);
    position: absolute;
    z-index: 20;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(255,255,255,0.6);
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    user-select: none;
    font-size: 20px;
  }

  .arrow.left { left: 8px; }
  .arrow.right { right: 8px; }
  .close-button {
    box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.9);
    position: absolute;
    z-index: 20;
    top: 56px;
    right: 16px;
    background: rgba(255,255,255,0.6);
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    user-select: none;
    font-size: 20px;
  }
  
  .fadeout {
      opacity: 1;
      animation: fadeout 1s ease forwards;
      animation-delay: 2s;
  }

  @keyframes fadeout {
      to {
          opacity: 0;
      }
  }

  .fadeout5s {
      opacity: 1;
      animation: fadeout 1s ease forwards;
      animation-delay: 5s;
  }

  @keyframes fadeout5s {
      to {
          opacity: 0;
      }
  }
  
  .text-rounded-corners {
      box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.9);
      z-index: 20;
      background-color: rgba(255,255,255,0.7);
      width: fit-content;
      border-radius: 12px;
      padding: 0 6px 0 6px;
  }

  .video-duration-overlay {
      background: rgba(0,0,0,0.3);
      color: #fff;
      font-size: 0.7em;
      padding: 2px 2px;
      border-radius: 4px;
      z-index: 15;
      pointer-events: none;
  }

  .date {
      position: fixed; 
      z-index: 20; 
      height: 25px;
      top: 50px;
      left: 50%;
      transform: translate(-50%, 0);
      pointer-events: none;
  }

  .play-icon-container {
      display: flex; 
      align-items: center; 
      flex-direction: column; 
      justify-content: center; 
      height: 100%;
  }

  .play-icon {
      border: none;
      filter: drop-shadow(1px 1px 5px rgba(0, 0, 0, 0.9));
      content: '';
      width: 64px;
      height: 64px;
      background: url('/play-icon.svg') no-repeat center;
      background-size: contain;
      z-index: 15;
  }

  .details {
      position: absolute; 
      bottom: 60px; 
      left: 50%; 
      right: 50%; 
      width: 300px; 
      transform: translateX(-50%); 
      z-index: 20;
      padding: 6px 6px 0 6px;
  }

  .details > div {
    display: flex;
    justify-content: space-between;
    line-height: 0.8;
  }

  .icon {
    position: fixed;
    bottom: 10px;
    width: 40px;
    height: 40px;
    background-color: white;
    z-index: 20;
    background-size: contain;
    border: none;
  }
  
  .favorite-checked {
    left: calc(50% - 40px);
    right: 50%;
    transform: translateX(-50%);
    mask: url('/favorite-checked.svg') no-repeat center;
  }
  
  .favorite-unchecked {
    left: calc(50% - 40px);
    right: 50%;
    transform: translateX(-50%);
    mask: url('/favorite-unchecked.svg') no-repeat center; 
  }

  .trash {
    left: calc(50% + 40px);
    right: 50%;
    transform: translateX(-50%);
    mask: url('/deleted.svg') no-repeat center;
  }

  .trash-checked {
    left: calc(50% + 40px);
    right: 50%;
    transform: translateX(-50%);
    mask: url('/deleted-filled.svg') no-repeat center;
  }
</style>
