import React, { Component } from 'react';

export class FetchData extends Component {
  static displayName = FetchData.name;

  constructor(props) {
    super(props);
    this.state = { images: [], loading: true };
  }

  componentDidMount() {
    this.populateData();
  }

  static renderTable(images) {
    return (
      <table className="table table-striped" aria-labelledby="tableLabel">
        <thead>
          <tr>
            <th>Guid</th>
            <th>Location</th>
            <th>Size</th>
            <th>Date Taken</th>
          </tr>
        </thead>
        <tbody>
          {images.map(image =>
            <tr key={image.guid}>
              <td>{image.guid}</td>
              <td>{image.location}</td>
              <td>{image.sizekb}</td>
              <td>{image.datetaken}</td>
            </tr>
          )}
        </tbody>
      </table>
    );
  }

  render() {
    let contents = this.state.loading
      ? <p><em>Loading...</em></p>
      : FetchData.renderTable(this.state.images);

    return (
      <div>
        <h1 id="tableLabel">Image metadata</h1>
        {contents}
      </div>
    );
  }

  async populateData() {
    const response = await fetch('photo');
    const data = await response.json();
    this.setState({ images: data, loading: false });
  }
}
