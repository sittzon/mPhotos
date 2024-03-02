import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Zoom, Virtual, Keyboard } from 'swiper/modules';
import 'swiper/css';
import './MLightbox.css';

const MLightbox = (props) => {;
  const [ lightboxVisible, setLightboxVisible ] = useState(false);
  const [ currentIndex, setCurrentIndex ] = useState(0);
  const [ currentGuid, setCurrentGuid ] = useState('');
  const [ currentCaption, setCurrentCaption ] = useState('');
  const [ metaData, setMetaData ] = useState();
  
  useEffect(() => { 
    window.addEventListener('img-clicked', showLightbox);

    setMetaData(props.metaData); 
  }, []);

  const showLightbox = (event) => {
    const guid = event.detail.id;
    const index = event.detail.index;
    setCurrentGuid(guid);
    setCurrentIndex(index);
    setCurrentCaption(event.detail.caption);

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
              <Swiper
                modules={[Zoom, Virtual, Keyboard]}
                initialSlide={currentIndex}
                // spaceBetween={10}
                virtual={{
                  enabled: true,
                  addSlidesAfter: 1,
                  addSlidesBefore: 1,
                  cache: true
                }}
                grabCursor={true}
                keyboard={true}
                zoom={true}
                speed={150}
                lazyPreloadPrevNext={1}
                updateOnWindowResize={true}
                onSlideChange={() => console.log('slide change')}
                onSwiper={(swiper) => console.log(swiper)}
              >
                {props.metaData
                  .map((slideContent, index) => 
                  <SwiperSlide key={slideContent.guid} virtualIndex={index}>
                    <div>
                      <p>{index} of {props.metaData.length}</p>
                      {/* <div class="swiper-zoom-container"> */}
                        <img 
                          key={slideContent.guid}
                          src={'photos/' + slideContent.guid}
                          alt={slideContent.dateTaken} 
                          loading={`${index === currentIndex? "eager" : "lazy"}`} 
                          />
                          <div className="swiper-lazy-preloader"></div>
                      {/* </div> */}
                      <p>{slideContent.dateTaken}</p>
                      </div>
                  </SwiperSlide>
                  )
                }
          </Swiper>
        </div>
        }
      </>
  );
};

export default MLightbox;