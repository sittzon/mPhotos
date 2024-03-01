import React, { useState, useEffect, useCallback, useRef } from 'react';
import useEmblaCarousel from 'embla-carousel-react'
import './MLightbox.css';

const MLightbox = (props) => {;
  const [ lightboxVisible, setLightboxVisible ] = useState(false);
  const [ currentIndex, setCurrentIndex ] = useState(0);
  const [ currentGuid, setCurrentGuid ] = useState('');
  const [ currentCaption, setCurrentCaption ] = useState('');
  const [ currentIndexes, setCurrentIndexes ] = useState([]);
  const [emblaRef] = useEmblaCarousel();
  // useEmblaCarousel.globalOptions = { loop: true }
  
  useEffect(() => { 
    window.addEventListener('img-clicked', showLightbox);

    // setMetaData(props.metaData);
  }, []);

  const showLightbox = (event) => {
    const guid = event.detail.id;
    const index = event.detail.index;
    // console.log(event.detail);
    setCurrentGuid(guid);
    setCurrentIndex(index);
    setCurrentCaption(event.detail.caption);

    // setCurrentIndexes([index-1,index,index+1]);
    setCurrentIndexes([index,index+1,index+2]);

    toggleLightboxVisible();
  };

  const toggleLightboxVisible = () => {
    setLightboxVisible(!lightboxVisible);

    // Toggle scrolling of underlying document
    if (!lightboxVisible) {
      document.body.classList.add('lightbox-visible')
      document.body.scroll = "no";
    } else {
      document.body.classList.remove('lightbox-visible');  
      document.body.scroll = "yes";
    }
  };

  return (
      <>
        {lightboxVisible &&
          <div 
            className='mLightbox'
            onClick={(event) => {
              if (event.target.tagName === 'IMG' ||
                event.target.tagName === 'BUTTON') {
                return;
              }
              toggleLightboxVisible();
            }}
          >

            <div className="embla" ref={emblaRef}>
                <div className="embla__container">
                {currentIndexes
                  .map((item, index) => 
                  <div className="embla__slide">
                    <div>
                      <p>{item} of {props.metaData.length}</p>
                      <img key={props.metaData[item].guid+'_full'}
                        src={'photos/' + props.metaData[item].guid}
                        width={props.metaData[item].width}
                        loading={`${item === currentIndex? "eager" : "lazy"}`}
                        alt={props.metaData[item].dateTaken} 
                        />
                      <p>{props.metaData[item].dateTaken}</p>
                    </div>
                  </div>
                  )
                }
              </div>
            </div>
          </div>
        }
      </>
  );
};

export default MLightbox;