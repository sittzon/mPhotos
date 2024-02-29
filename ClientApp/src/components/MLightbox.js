import React, { useState, useEffect, useCallback, useRef } from 'react';
import './MLightbox.css';

const MLightbox = (props) => {;
  const [ lightboxVisible, setLightboxVisible ] = useState(false);
  const [ currentIndex, setCurrentIndex ] = useState(0);
  const [ currentGuid, setCurrentGuid ] = useState('');
  const [ currentCaption, setCurrentCaption ] = useState('');

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
    toggleLightboxVisible();
  };

  const toggleLightboxVisible = () => {
    setLightboxVisible(!lightboxVisible);

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
              if (event.target.tagName === 'IMG') {
                return;
              }
              toggleLightboxVisible();
            }}
          >
            <div>
              <p>{currentIndex + 1} of {props.metaData.length}</p>
            </div>
            <img src={'photos/' + currentGuid}/>
            <p>{currentCaption}</p>
          </div>
        }
      </>
  );
};

export default MLightbox;