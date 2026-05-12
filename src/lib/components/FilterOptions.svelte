<script lang="ts">
    import { onMount } from 'svelte';

    export let isShowingAll: boolean = false;
    export let isVideoFiltered: boolean = false;
    export let isFavoriteFiltered: boolean = false;
    export let isLivePhotoVideosFiltered: boolean = false;
    export let isLivePhotosFiltered: boolean = false;
    export let isPhotosFiltered: boolean = false;

    let isModalOpen: boolean = false;

    const dispatchShowAllEvent = () => {
        dispatchEvent(new CustomEvent('showAll'));
    }

    const dispatchToggleVideosEvent = () => {
        dispatchEvent(new CustomEvent('toggleVideos'));
    }

    const dispatchTogglePhotosEvent = () => {
        dispatchEvent(new CustomEvent('togglePhotos'));
    }

    const dispatchToggleFavoritesEvent = () => {
        dispatchEvent(new CustomEvent('toggleFavorites'));
    }

    const dispatchToggleLivePhotoVideosEvent = () => {
        dispatchEvent(new CustomEvent('toggleLivePhotoVideos'));
    }

    const dispatchToggleLivePhotosEvent = () => {
        dispatchEvent(new CustomEvent('toggleLivePhotos'));
    }

    $: options = [
        {id: 0, displayName: 'Show all', val: isShowingAll, func: () => {dispatchShowAllEvent()}, icon: 'aspect-ratio', disabled: !isVideoFiltered && !isFavoriteFiltered && !isPhotosFiltered && !isLivePhotoVideosFiltered && !isLivePhotosFiltered},
        {id: 1, displayName: 'Photos', val: isPhotosFiltered, func: () => {dispatchTogglePhotosEvent()}, icon: 'photo'},
        {id: 2, displayName: 'Live Photos', val: isLivePhotosFiltered, func: () => {dispatchToggleLivePhotosEvent()}, icon: 'aspect-ratio'},
        {id: 3, displayName: 'Videos', val: isVideoFiltered, func: () => {dispatchToggleVideosEvent()}, icon: 'video'},
        {id: 4, displayName: 'Live Photo Videos', val: isLivePhotoVideosFiltered, func: () => {dispatchToggleLivePhotoVideosEvent()}, icon: 'live-photo-video'},
        {id: 5, displayName: 'Favorites', val: isFavoriteFiltered, func: () => {dispatchToggleFavoritesEvent()}, icon: 'favorite-checked'},
    ]

    onMount(() => {
        document.addEventListener('toggleOpenFilterOptions', (event) => {
            console.log("Toggled from parent!");
            isModalOpen = event.detail.isOpen;
        });
    });
</script>

<div id="filter-options" class="text-rounded-corners">
    <ul>
        {#each options as {displayName, val, func, icon, disabled}}
        <li>
            <div class="checkbox-wrapper-29">
                    <label for={displayName} class="checkbox">
                        <input class="checkbox__input" disabled={disabled} type="checkbox" id={displayName} name={displayName} checked={val} on:change={() => func()}/>
                        <span class="checkbox__label"></span>
                        {displayName}
                    </label>
            </div>
        </li>
        {/each}
    </ul>
</div>

<style>
    #filter-options {
        cursor: pointer;
        font-size: 16px;
        top: 260px;
        right: 10px;
        position: fixed;
        align-items: center;
        box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.9);
        z-index: 2;
        border: 1px solid white;
    }
    
    ul {
        border-radius: 12px;
        background-color: rgba(255,255,255,0.8);
        max-height: 100%; 
        margin: 0;
        list-style: none;
        list-style-type: none;
        text-align: right;
        padding: 5px 5px 5px 12px;
        width: 200px;
        text-align: right;
    }
    
    li {
        margin: 5px 0;
    }

    label {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    
    .text-rounded-corners {
        background-color: rgba(255,255,255,0.7);
        width: fit-content;
        border-radius: 12px;
        margin: 0;
    }

    input:disabled {
        pointer-events: none;
        opacity: 0.3;
    }




  .checkbox-wrapper-29 {
    --size: 1rem;
    --background: #fff;
    font-size: var(--size);
  }

  .checkbox-wrapper-29 *,
  .checkbox-wrapper-29 *::after,
  .checkbox-wrapper-29 *::before {
    box-sizing: border-box;
  }

  .checkbox-wrapper-29 input[type="checkbox"] {
    visibility: hidden;
    display: none;
  }

  .checkbox-wrapper-29 .checkbox__label {
    width: var(--size);
  }

  .checkbox-wrapper-29 .checkbox__label:before {
    content: ' ';
    display: block;
    height: var(--size);
    width: var(--size);
    position: absolute;
    top: calc(var(--size) * 0.125);
    left: 0;
    background: var(--background);  
  }

  .checkbox-wrapper-29 .checkbox__label:after {
    content: ' ';
    display: block;
    height: var(--size);
    width: var(--size);
    border: calc(var(--size) * .14) solid #000;
    transition: 200ms;
    position: absolute;
    top: calc(var(--size) * 0.125);
    left: 0;
    background: var(--background);  
  }

  .checkbox-wrapper-29 .checkbox__label:after {
    transition: 100ms ease-in-out;
  }

  .checkbox-wrapper-29 .checkbox__input:checked ~ .checkbox__label:after {
    border-top-style: none; 
    border-right-style: none;
    -ms-transform: rotate(-45deg); /* IE9 */
    transform: rotate(-45deg);
    height: calc(var(--size) * .5);
    border-color: green;
  }

  .checkbox-wrapper-29 .checkbox {
    position: relative;
    display: flex;
    cursor: pointer;
    /* Mobile Safari: */
    -webkit-tap-highlight-color: rgba(0,0,0,0);   
  }

  .checkbox-wrapper-29 .checkbox__label:after:hover,
  .checkbox-wrapper-29 .checkbox__label:after:active {
     border-color: green; 
  }

  .checkbox-wrapper-29 .checkbox__label {
    margin-right: calc(var(--size) * 0.45);
  }




</style>
