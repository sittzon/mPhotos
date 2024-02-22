import React, { useState, useEffect } from 'react';
import { Gallery, Item } from 'react-photoswipe-gallery'
import 'photoswipe/dist/photoswipe.css'
import './Home.css';

function Home() {
    // The 'useState' hook (function) returns a getter (variable) & setter (function) for your state value
    // and takes the initial/default value for it/to set it to, e.g.
    const [ columns, setColumns ] = useState(5);
    const [ metaData, setMetaData ] = useState([]);
    const [ sortOrder, setSortOrder ] = useState(true);

  // Empty dependency array -> Only run on component mount
  useEffect(() => { populateData(); }, []);
  
  const groupByN = (n, arr) => {
    let result = [];
    for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n));
    return result;
  };
  
  const populateData = async () => {
    const response = await fetch('photos/metadata');
    const metaData = await response.json();
    setMetaData(metaData);
  };

  const toggleColumns = () => {
    const columnsNew = 
    columns === 3? 5 : 
      (columns === 5? 7 : 3);
    setColumns(columnsNew);
  };
  
  const sortImagesByDate = () => {
    let sortedMetaData = [...metaData].sort((a, b) => {
      if (sortOrder) {
        return a.dateTaken > b.dateTaken
      } else {
        return a.dateTaken < b.dateTaken
      }
    });
    setMetaData(sortedMetaData);
    setSortOrder(!sortOrder);
  };

  return (
      <div>
        <div className="fixed">
          <button className="btn btn-custom" onClick={sortImagesByDate}>Sort</button>
          <button className="btn btn-custom" onClick={toggleColumns}>Zoom</button>
        </div>
        <p className="align-right">{metaData.length} photos</p>
        <div>
          <Gallery withCaption id="my-gallery">
          {groupByN(columns, metaData).map((group, index) => (
            <div key={index} className="row align-items-center g-1 mb-1">
              {group.map(metaData =>
                <div className="col" key={metaData.guid}>
                  <Item
                    id={metaData.guid}
                    original={"photos/" + metaData.guid}
                    thumbnail={"photos/" + metaData.guid + "/thumb"}
                    width={metaData.width}
                    height={metaData.height}
                    caption={
                      metaData.dateTaken + " - " + 
                      metaData.name + " - " + 
                      metaData.width + "x" + metaData.height + " - " + 
                      metaData.sizeKb + "kB"}
                    >
                    {({ ref, open }) => (
                      <img ref={ref} onClick={open} src={"photos/" + metaData.guid + "/thumb"} alt={metaData.dateTaken}/>
                    )}
                  </Item>
                </div>
              )}
            </div>
          ))}
          </Gallery>
        </div>
      </div>
  );
};

export default Home;