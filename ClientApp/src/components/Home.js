import React, { Component, useState } from 'react';
import { Gallery, Item } from 'react-photoswipe-gallery'
import 'photoswipe/dist/photoswipe.css'
import './Home.css';

export class Home extends Component {
  static displayName = Home.name;

  constructor(props) {
    super(props);
    this.state = { images: [], metaData: [], loading: true, sortOrder: false, columns: 3};
    this.sortImagesByDate = this.sortImagesByDate.bind(this);
    this.toggleColumns = this.toggleColumns.bind(this);
  }

  componentDidMount() {
    this.populateData();
  }
  
  static groupByN = (n, arr) => {
    let result = [];
    for (let i = 0; i < arr.length; i += n) result.push(arr.slice(i, i + n));
    return result;
  };
  
  async populateData() {
    const response = await fetch('photos/metadata');
    const metaData = await response.json();
    this.setState({ metaData: metaData });
    
    let localImages = [];
    metaData.map(async meta => {
      const response = await fetch('photos/' + meta.guid + '/thumb');
      const data = await response.blob();
      localImages.push({image: data, metaData: meta});
      this.setState({ images: localImages, loading: false})
    });
  }

  toggleColumns() {
    const columns = this.state.columns === 3? 
    5 : this.state.columns === 5? 7 : 
    3;
    this.setState({ columns: columns });
  }
  
  sortImagesByDate() {
    let sortedImages = [...this.state.images].sort((a, b) => {
      if (this.state.sortOrder) {
        return a.metaData.dateTaken > b.metaData.dateTaken
      } else {
        return a.metaData.dateTaken < b.metaData.dateTaken
      }
    });
    this.setState({ images: sortedImages, sortOrder: !this.state.sortOrder});
  }

  render() {
    let indexing = this.state.loading
      ? <p><em>Indexing...</em></p>
      : <p className="align-right">{this.state.images.length} photos</p>;

    return (
      <div>
        <div className="fixed">
          <button className="btn btn-custom" onClick={this.sortImagesByDate}>Sort</button>
          <button className="btn btn-custom" onClick={this.toggleColumns}>Zoom</button>
        </div>
            { indexing }
        <div>
        <Gallery withCaption id="my-gallery">
        {Home.groupByN(this.state.columns, this.state.images).map((group, index) => (
          <div key={index} className="row align-items-center g-1 mb-1">
            {group.map(image =>
              <div className="col" key={image.metaData.guid}>
                <Item
                  id={image.metaData.guid}
                  original={"photos/" + image.metaData.guid}
                  thumbnail={URL.createObjectURL(image.image)}
                  width={image.metaData.width}
                  height={image.metaData.height}
                  caption={
                    image.metaData.dateTaken + " - " + 
                    image.metaData.name + " - " + 
                    image.metaData.width + "x" + image.metaData.height + " - " + 
                    image.metaData.sizeKb + "kB"}
                  >
                  {({ ref, open }) => (
                    <img ref={ref} onClick={open} src={URL.createObjectURL(image.image)} alt={image.metaData.dateTaken}/>
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
  }  
}
