<script lang="ts">
    import { onMount } from 'svelte';
    import type { DateIndexEntry } from "$api";
    import { createEventDispatcher } from 'svelte';
    import { cubicOut } from 'svelte/easing';

    export let dateIndex: Array<DateIndexEntry> = [];
    export let photoIndex: number = 0;
    export let closeFromParent: boolean = false;

    $: if (closeFromParent) {
        isDatePickerOpen = false;
     }

    let isDatePickerOpen: boolean = false;
    const months = [ "January", "February", "March", "April", "May", "June", 
           "July", "August", "September", "October", "November", "December" ];
    const dispatch = createEventDispatcher();
    const errorNoDateFound = 'error-no-date-found';

    onMount(() => {
        document.addEventListener('click', handleDatePickerToggleOpen);
    });

    const handleDatePickerToggleOpen = (e: Event) => {
        const target = e.target as HTMLElement;
        if (target.closest('#datepicker')) {
            isDatePickerOpen = !isDatePickerOpen;
            setTimeout(() => {
                const target = document.getElementsByClassName("selected-date").item(0);
                target.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 300);
        } else {
            isDatePickerOpen = false;
        }
    }

    const getDateFormattedShort = (dateTaken: string | null | undefined) => {
        if (dateTaken == null) {
            return "No date";
        }
        
        if (errorNoDateFound == dateTaken)
        {
            return errorNoDateFound;
        }

        // -1 because 0-index months array
        const currentMonth = +dateTaken.split('-')[1] - 1;
        const currentYear = +dateTaken.split('-')[0];
        return months[currentMonth] + ' ' + currentYear;
    }

    // Date label for the photo currently shown in the middle of the list.
    // Derived from the compact month index so it also works for ranges
    // whose photos have not been downloaded yet. Takes its inputs as
    // arguments so the reactive statement below tracks them.
    const getCurrentDateFormattedShort = (photoIdx: number, idx: DateIndexEntry[]) => {
        if (idx.length === 0) {
            return getDateFormattedShort(null);
        }
        let entry = idx[0];
        for (let i = 1; i < idx.length; i++) {
            if (idx[i].index > photoIdx) break;
            entry = idx[i];
        }
        return getDateFormattedShort(entry.dateTaken);
    }

    // Recompute the label when the scroll position or the date index changes
    // (Svelte does not track variables used inside a called function)
    $: currentDateString = getCurrentDateFormattedShort(photoIndex, dateIndex);
    
    // Custom transition that handles both size and position
    function slideAndResizeSequential(node: HTMLElement, { duration = 400, easing = cubicOut } = {}) {
        const style = getComputedStyle(node);
        const height = parseFloat(style.height);
        const width = parseFloat(style.width);
        const opacity = +style.opacity;

        return {
            duration,
            css: (t: number) => {
                // detect if we're entering (t increasing) or leaving (t decreasing)
                const isEntering = t > 0.5; // crude but effective check for visual direction

                let widthProgress = 0, heightProgress = 0;

                if (t >= 0 && t <= 1) {
                    if (isEntering) {
                        // entering (0 → 1): width first, then height
                        widthProgress = t < 0.5 ? easing(t * 2) : 1;
                        heightProgress = t < 0.5 ? 0 : easing((t - 0.5) * 2);
                    } else {
                        // leaving (1 → 0): height first, then width
                        const reversedT = 1 - t;
                        heightProgress = reversedT < 0.5 ? easing(1 - reversedT * 2) : 0;
                        widthProgress = reversedT < 0.5 ? 1 : easing(1 - (reversedT - 0.5) * 2);
                    }
                }

                return `
                    opacity: ${t * opacity};
                    transform: translateY(${(1 - t) * -5}px);
                    width: ${widthProgress * width}px;
                    height: ${heightProgress * height}px;
                `;
            }
        };
    }
</script>

<button id="datepicker" class="text-rounded-corners current-date">
    {#if !isDatePickerOpen}
        <div transition:slideAndResizeSequential={{duration: 300}}>{currentDateString}</div>
    {:else}
        <ul id="datelist" class="full-height" transition:slideAndResizeSequential={{duration: 300}}>
            {#each dateIndex as entry (entry.index)}
                <li>
                    <button class={getDateFormattedShort(entry.dateTaken) == currentDateString ? "selected-date" : ""}
                            on:click={() => dispatch("setScroll", entry.index)}>
                        {getDateFormattedShort(entry.dateTaken)}
                    </button>
                </li>
            {/each}
        </ul>
    {/if}
</button>

<style>
    #datepicker {
        cursor: pointer;
        font-size: 18px; 
        left: 10px; 
        top: max(70px, calc(var(--safe-top) + 30px));
        text-align: center;
        color: darkslategray;
        align-items: center;
        box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.9);
        z-index: 1;
        border: 1px solid white;
    }

    #datepicker div {
        padding: 0 8px;
        width: fit-content;
    }
    
    button {
        overflow: hidden;
        color: black;
        background: none;
        border: none;
        padding: 0;
    }
    
    .full-height {
        max-height: 50dvh;
    }
    
    .selected-date {
        font-weight: bold;
    }
    
    ul {
        border-radius: 12px;
        background-color: rgba(255,255,255,0.8);
        max-height: 100%; 
        margin: 0;
        list-style: none;
        list-style-type: none;
        text-align: right;
        padding: 0px 3px 0px 3px;
        text-align: right;
        overflow-y: auto;
    }

    
    li {
        margin: 4px 0;
    }

    .text-rounded-corners {
        background-color: rgba(255,255,255,0.7);
        width: fit-content;
        border-radius: 12px;
        margin: 0;
    }

    .current-date {
        position: fixed;
    }
</style>