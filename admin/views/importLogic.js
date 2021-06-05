// goes at the top of "Update Data" page 

async function fetchPgRows() {
  let data = await fetch(window.location.href + '/pg-rows')
    .catch(e => console.error(e))
  return await data === undefined ? '' : data.json().catch(e => console.error(e));
}

async function fetchPgSpace() {
  let data = await fetch(window.location.href + '/pg-space')
    .catch(e => console.error(e))
  return await data == undefined ? '' : data.json().catch(e => console.error(e));
}

async function fetchLastUpdate() {
  let data = await fetch('/api/meta-information')
    .catch(e => console.error(e))
  return await data === undefined ? '' : data.json().catch(e => console.error(e));
}

async function fetchEtlLogs() {
  let logs = await fetch(window.location.href + '/etl-log')
    .catch(e => console.error(e))
  return await logs === undefined ? '' : logs.json().catch(e => console.error(e));
}

function renderEtlLogs(logs) {
  if (logs == null) {
    return;
  }
  let div = document.getElementById('etl-log');
  div.innerHTML =
    logs.map(L => {
      let dt = new Date(L.time_stamp);
      return '<tr><td style="color: navy; min-width: 150px; border: none; padding:4">' + dt.toLocaleString() + '</td><td style="color:blue; border: none; padding:4;">' + L.message + '</td></tr>'
    }).join('')
}

async function fetchEtlStatus() {
  const status = await fetch(window.location.href + '/etl-status')
    .catch(e => console.error(e));
  return await status === undefined ? '' : status.json().catch(e => console.error(e));
}

function renderEtlStatus(status) {
  if (status == null) {
    return;
  }
  let div = document.getElementById('etl-status');
  if (status.etl_started.toLowerCase() === 'false') {
    /* Has NOT started */
    div.innerHTML = "<span>&nbsp;</span>"
  }
  else {
    /* HAS started */
    if (status.etl_ran_to_completion.toLowerCase() === 'false') {
      /* Has NOT completed */
      div.innerHTML = '<span>The Import to Preview process has started. Please allow up to 30 minutes for the process to complete.</span>';
    }
    else if (status.etl_ran_to_completion.toLowerCase() === 'true') {
      /* HAS completed */
      if (parseInt(status.minutes_since_last_log) > 60 * 48) {
        /* More than 24 hours ago */
        div.innerHTML = "<span>The Import to Preview process ran more than 48 hours ago. Please run it again, since the source data may have changed.</span>";
      }
      else {
        /* Less than 24 hours ago */
        if (parseInt(status.etl_staging_1_num_rows) < 1) {
          /* The staging table is empty */
          div.innerHTML = "<span>The preview data is empty. Please report this to the development team.</span>";
        }
        else {
          div.innerHTML = "<span style='font-size: 20px; font-family: 'Courier New', Courier, monospace;'>The preview data is imported successfully and is ready to be imported to the live site.</span>";
        }
      }
    }
  }

}

async function fetchDataValidationItems() {
  const data = await fetch(window.location.href + '/etl-validation')
    .catch(e => console.error(e));
  return await data === undefined ? '' : data.json().catch(e => console.error(e));
}

function renderValidationItems(items) {
  if (items == null) {
    return;
  }
  let div = document.getElementById('etl-validation');
  div.innerHTML =
    items.map(L => {
      return '<tr><td style="color: navy; white-space: nowrap; border: none; padding:4">' + L.test + '</td><td style="color:blue; border: none; padding:4;">' + L.details + '</td><td style="color:blue; border: none; padding:4;">' + L.id + '</td><td style="color:blue; border: none; padding:4;">' + L.listing + '</td></tr>'
    }).join('')
}

async function staging() {

  /* Prompt for confirmation */
  let confirmation = confirm("Import data to preview site?");
  if (confirmation == false) { return; }
  document.getElementById('status').innerText = 'Preparing to run import process...';

  /* Safety check to abort if ETL is in progress */
  const logs = await fetchEtlLogs();
  const hasStartMessage = (logs.filter(i => i.message === 'Python ETL Script Start')).length >= 1;
  const hasEndMessage = (logs.filter(i => i.message === 'Python ETL Script End')).length >= 1;
  if (hasStartMessage && !hasEndMessage) {
    document.getElementById('status').innerText = 'There is already an import in progress. Please allow up to 30 minutes for that process to complete.';
  }

  /* Trigger the ETL process to start */
  fetch(window.location.href + '?' + new URLSearchParams({ action: 'runetl' }), { method: 'GET' })
    .catch(e => { document.getElementById('status').innerText = 'Failed to start import process'; })

  /* Query the server for ETL status on an interval */
  const stagingInterval = window.setInterval(async function () {

    /* Fetch and display ETL logs */
    const logs = await fetchEtlLogs();
    renderEtlLogs(logs);

    /* Update the status message */
    const jobStart = logs.filter(L => L.message === 'Job Start');
    const jobEnd = logs.filter(L => L.message === 'Python ETL Script End');
    const stagingFinalized = logs.filter(L => L.message === 'Finalize the staging table');
    if (stagingFinalized && stagingFinalized.length >= 1) {
      const items = await fetchDataValidationItems();
      renderValidationItems(items)
    }
    if (jobStart && jobStart.length >= 1) {
      document.getElementById('status').innerHTML = 'Import process is running...';
    }
    if (jobEnd && jobEnd.length >= 1) {
      const previewPage = [window.location.protocol, '//', window.location.host.replace(/\d+/, '3000'), '?datatable=staging'].join('');
      document.getElementById('status').innerHTML = '<span>&#10004;&nbsp;Successfully imported to the Preview Site!</span><br/> <a href="' + previewPage + '"target="_blank">Click to View Preview Site</a>';
      clearInterval(stagingInterval);
    }
  }, 4000)

}

async function production() {

  /* Prompt for confirmation */
  let confirmation = confirm("The LIVE SITE will be updated. Proceed?");
  if (confirmation == false) { return; }
  document.getElementById('status').innerText = 'Preparing to update production...';

  /* Trigger the production udpate process to start */
  const status = await fetch(window.location.href + '?' + new URLSearchParams({ action: 'runprod' }), { method: 'GET' })
    .catch(e => { document.getElementById('status').innerHTML = '<span>&#10008;&nbsp;Failed to start import process</span>'; })

  /* Query the server for status on an interval */
  const prodInterval = window.setInterval(async function () {

    /* Check if the production table has been updated */
    let timestamp = await fetchLastUpdate();
    let friendlyTimestamp = new Date(timestamp).toLocaleString();
    document.getElementById('-time').innerText = friendlyTimestamp;

    /* Compare to see if this time is within 2 minutes of the current time */
    const currentTime = new Date(new Date().toISOString());
    const updatedTime = new Date(new Date(timestamp).toISOString());
    const minutesBetweenDates = (currentTime.getTime() - updatedTime.getTime()) / 60000;
    if (minutesBetweenDates < 2) {
      document.getElementById('status').innerHTML = "<span>&#10004;&nbsp;Successfully imported to the Live Site!</span>";
      clearInterval(prodInterval);
    }
  }, 2000)

}
