import React, { Component } from 'react';

export class LibraryMeta extends Component {
  static displayName = LibraryMeta.name;

  constructor(props) {
    super(props);
    this.state = { libmeta: {}, loading: true };
  }

  componentDidMount() {
    this.populateData();
  }

  static renderTable(libmeta) {
    return (
      <table className="table table-striped" aria-labelledby="tableLabel">
        <thead>
          <tr>
            <th>Total photos</th>
            <th>Total Size (Mb)</th>
            <th>Latest Index Time</th>
          </tr>
        </thead>
        <tbody>
          <tr key={libmeta.latestindextime}>
            <td>{libmeta.totalphotosno}</td>
            <td>{libmeta.totalsizemb}</td>
            <td>{libmeta.latestindextime}</td>
          </tr>
        </tbody>
      </table>
    );
  }

  render() {
    let contents = this.state.loading
      ? <p><em>Loading...</em></p>
      : LibraryMeta.renderTable(this.state.libmeta);

    return (
      <div>
        <h1 id="tableLabel">Library metadata</h1>
        {contents}
      </div>
    );
  }

  async populateData() {
    const response = await fetch('library');
    const data = await response.json();
    this.setState({ libmeta: data, loading: false });
  }
}
