import React, { useEffect, useState } from 'react';
import { FixedSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

const LibraryMeta = () => {
  const [ metaData, setMetadata ] = useState([]);

  useEffect(() => {
    populateData();
  }, []);
  
  const populateData = async ()=> {
    const response = await fetch('photos/metadata');
    const data = await response.json();
    setMetadata(data);
  }

  const Row = ({ index, style }) => {
    const isEvenRow = index % 2 === 0;
    const backgroundColor = isEvenRow ? '#EEE' : '#FFF';
    const rowStyle = {
      ...style,
      backgroundColor,      
      display: 'flex',
      justifyContent: 'space-between',
      padding: '0 16px',
      wordWrap: 'anywhere'
    };
    return (
      <div style={rowStyle}>
        <p>{metaData[index].guid}</p>
        <p>{metaData[index].name}</p>
        <p>{metaData[index].sizeKb}</p>
        <p>{metaData[index].dateTaken}</p>
        <p>{metaData[index].width}</p>
        <p>{metaData[index].height}</p>
      </div>
    );
  };

  return (
    <div className="white-bkg" 
      style={{ display: 'flex', 
        flexDirection: 'column', 
        height: '87vh'}}
      >
      <div>
        <h1>Photos metadata</h1>
        <p>{metaData.length} photos indexed</p>
        <div>
          <div style={{ display: 'flex', 
            justifyContent: 'space-between', 
            padding: '0 16px'}}
          >
            <h5>Guid</h5>
            <h5>Name</h5>
            <h5>Size (kB)</h5>
            <h5>Date Taken</h5>
            <h5>Width</h5>
            <h5>Height</h5>
          </div>
        </div>
      </div>

      <AutoSizer>
        {({ height, width }) => (
          <FixedSizeList 
            height={height} 
            width={width} 
            itemSize={40} 
            itemCount={metaData.length}
          >
            {Row}
          </FixedSizeList>
        )}
      </AutoSizer>
    </div>
  );
}

export default LibraryMeta;