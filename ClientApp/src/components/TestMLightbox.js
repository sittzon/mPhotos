import React, { useState, useEffect, useCallback, useRef } from 'react';
import MLightbox from './MLightbox';
import './Home.css';

const TestMLightbox = () => {;
  const [ metaData, setMetaData ] = useState([]);

  useEffect(() => { 
    populateData();
  }, []);

  const populateData = async () => {
    const response = await fetch('photos/metadata');
    const metaData = await response.json();
    
    setMetaData(metaData);
  };

  const imageClicked = (id, index, caption) => {
    const evt = new CustomEvent('img-clicked', { detail: {id: id, index: index, caption: caption}}); 
    window.dispatchEvent(evt);
  };

  return (
      <div>
        { metaData.slice(0,80).map((m, index) => (
          <img 
            id={m.guid}
            key={m.guid}
            src={"photos/" + m.guid + "/thumb"} 
            alt={m.dateTaken} 
            caption={
              m.dateTaken + " - " + 
              m.name + " - " + 
              m.width + "x" + m.height + " - " + 
              m.sizeKb + "kB"}
            onClick={(event) => {
              console.log(event.target.alt);
              imageClicked(m.guid, index, event.target.alt);
            }}
          />
          ))}
          <MLightbox
            metaData={metaData}
          />
      </div>
  );
};

export default TestMLightbox;