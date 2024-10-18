import { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBars, faCircleInfo } from '@fortawesome/free-solid-svg-icons'

import config from "./config.js";
import { DriveControlPanel } from "./driveControls";
import { MBotScene } from './scene.js'

function ConnectionStatus({ status }) {
  let msg = "Wait";
  let colour = "#ffd300";
  if (status === true) {
    msg = "Connected";
    colour = "#00ff00";
  }
  else if (status === false) {
    msg = "Not Connected";
    colour = "#ff0000";
  }

  return (
    <div className="status" style={{backgroundColor: colour}}>
      {msg}
    </div>
  );
}

function StatusMessage({ robotPose, robotCell, clickedCell }) {
  let msg = [];
  if(robotPose != null){
    msg.push(
      <p className="robot-info" key="robotInfoPose">
        <i>Robot Pose:</i> (
          <b>x:</b> {robotPose.x.toFixed(3)},&nbsp;
          <b>y:</b> {robotPose.y.toFixed(3)},&nbsp;
          <b>t:</b> {robotPose.theta.toFixed(3)})
      </p>
    );
    msg.push(
      <p className="robot-info" key="robotInfoCell">
        <i>Robot Cell:</i> ({robotCell[0]}, {robotCell[1]})
      </p>
  );
  }
  if (clickedCell.length > 0) {
    msg.push(
      <p className="robot-info" key="robotInfoClicked">
        <i>Clicked:</i>&nbsp;
        <b>x:</b> {clickedCell[2].toFixed(3)},&nbsp;
        <b>y:</b> {clickedCell[3].toFixed(3)},&nbsp;
        Cell: [{clickedCell[1]}, {clickedCell[0]}]
      </p>
    );
  }

  return (
    <div className="status-msg">
      {msg}
    </div>
  );
}

function ToggleSelect({ small, label, explain, checked, onChange, isActive = true }) {
  const [viewInfo, setViewInfo] = useState(false);
  const [top, setTop] = useState(0);

  let sizeCls = "";
  if (small) sizeCls = " small";

  const toggleClasses = isActive ? "slider round" + sizeCls : "slider round disabled" + sizeCls;

  return (
    <div className="toggle-wrapper">
      <div className="row">
        <div className="col-7">
          <span>{label}</span>
        </div>
        <div
          className="col-1 info"
          onMouseEnter={(evt) => {
            setViewInfo(true);
            setTop(evt.clientY - 20);
          }}
          onMouseLeave={() => { setViewInfo(false); }}
        >
          <div className="info-icon">
            <FontAwesomeIcon icon={faCircleInfo} size="xs" />
          </div>
        </div>
        {viewInfo && (
          <span className="explain" style={{ top: top }}>
            {explain}
          </span>
        )}
        <div className="col-4 text-right toggle">
          <label className={"switch" + sizeCls}>
            <input
              type="checkbox"
              className="mx-2"
              checked={checked}
              onChange={isActive ? onChange : null}
              disabled={!isActive}
            />
            <span className={toggleClasses}></span>
          </label>
        </div>
      </div>
    </div>
  );
}

function SLAMControlPanel({ slamMode, onLocalizationMode, onMappingMode, onResetMap, saveMap }) {
  return (
    <>
      <ToggleSelect
        label={"Localization Mode"}
        explain={"Toggles localization mode and displays map."}
        checked={slamMode !== config.slam_mode.IDLE}
        onChange={onLocalizationMode}
      />
      {slamMode !== config.slam_mode.IDLE &&
        <div className="subpanel">
          <ToggleSelect
            label={"Mapping Mode"}
            checked={slamMode === config.slam_mode.FULL_SLAM}
            explain={"Toggles mapping mode on the robot."}
            onChange={onMappingMode}
            small={true}
          />
          <div className="button-wrapper-col">
            <button
              className={"button" + (slamMode !== config.slam_mode.FULL_SLAM ? " inactive" : "")}
              onClick={onResetMap}
            >
              Reset Map
            </button>
            <button
              className="button"
              onClick={saveMap}
            >
              Download Map
            </button>
          </div>
        </div>
      }
    </>
  );
}

function MBotSceneWrapper({ mbot, connected, requestMap, robotDisplay, laserDisplay, particleDisplay,
                            slamMode, setSlamMode,
                            setClickedCell, setRobotPose, setRobotCell}) {
  // Ref for the canvas.
  const canvasWrapperRef = useRef(null);
  const scene = useRef(new MBotScene());

  // Click callback when the user clicks on the scene.
  const handleCanvasClick = useCallback((pos) => {
    if (!scene.current.loaded) return;
    if (pos.length === 0 || scene.current.isMapLoaded()) {
      // If the map is not loaded or an empty cell is passed, clear.
      setClickedCell([]);
      return;
    }

    const clickedCell = [...scene.current.pixelsToCell(pos[0], pos[1]),
                         ...scene.current.pixelsToPos(pos[0], pos[1])];
    setClickedCell(clickedCell);
  }, [setClickedCell]);

  // Initialization of the scene.
  useEffect(() => {
    const runID = Math.floor(Math.random() * 10000);
    console.log("MBot Scene Init Effect", runID);

    scene.current.init().then(() => {
      console.log("Init scene complete", runID, scene.current.loaded)
      scene.current.createScene(canvasWrapperRef.current);
      scene.current.clickCallback = handleCanvasClick;
    }).catch((error) => {
      console.warn(error, runID);
    });

    // Return the cleanup function which stops the rerender.
    return () => {
      console.log("CLEANUP INIT SCENE", runID);
      // scene.current.destroy();
    }
  }, [canvasWrapperRef, handleCanvasClick]);

  // Effect to manage subscribing to the pose.
  useEffect(() => {
    if (scene.current.loaded) scene.current.toggleRobotView(robotDisplay);

    if (robotDisplay) {
      mbot.subscribe(config.POSE_CHANNEL, (msg) => {
        // Sets the robot position
        setRobotPose({x: msg.data.x, y: msg.data.y, theta: msg.data.theta});
        if (!scene.current.loaded) return;
        scene.current.updateRobot(msg.data.x, msg.data.y, msg.data.theta);
        if (scene.current.isMapLoaded()) {
          const robotCell = scene.current.posToCell(msg.data.x, msg.data.y);
          setRobotCell(robotCell);
        }
      }).catch((error) => {
        console.warn('Subscription failed for channel', config.POSE_CHANNEL, error);
      });
    }

    // Return the cleanup function which stops the rerender.
    return () => {
      mbot.unsubscribe(config.POSE_CHANNEL).catch((err) => console.warn(err));
    }
  }, [robotDisplay, setRobotPose, setRobotCell]);

  // Effect to manage subscribing to the Lidar.
  useEffect(() => {
    if (laserDisplay) {
      mbot.subscribe(config.LIDAR_CHANNEL, (msg) => {
        if (!scene.current.loaded) return;
        scene.current.drawLasers(msg.data.ranges, msg.data.thetas);
      }).catch((error) => {
        console.warn('Subscription failed for channel', config.LIDAR_CHANNEL, error);
      });
    }
    else {
      if (scene.current.loaded) scene.current.clearLasers();
    }

    // Return the cleanup function which stops the rerender.
    return () => {
      mbot.unsubscribe(config.LIDAR_CHANNEL).catch((err) => console.warn(err));
    }
  }, [laserDisplay]);

  // Effect to manage subscribing to the SLAM particles.
  useEffect(() => {
    if (particleDisplay) {
      mbot.subscribe(config.PARTICLE_CHANNEL, (msg) => {
        if (!scene.current.loaded) return;
        // Extract the particles into points.
        const particleList = msg.data.particles;
        const points = particleList.map(item => [item.pose.x, item.pose.y]);
        // Draw the particles.
        scene.current.drawParticles(points);
      }).catch((error) => {
        console.warn('Subscription failed for channel', config.PARTICLE_CHANNEL, error);
      });
    }
    else {
      if (scene.current.loaded) scene.current.clearParticles();
    }

    // Return the cleanup function which stops the rerender.
    return () => {
      mbot.unsubscribe(config.PARTICLE_CHANNEL).catch((err) => console.warn(err));
    }
  }, [particleDisplay]);

  // Effect to manage subscribing to the path.
  useEffect(() => {
    mbot.subscribe(config.PATH_CHANNEL, (msg) => {
      if (!scene.current.loaded) return;
      scene.current.drawPath(msg.data.path);
    }).catch((error) => {
      console.warn('Subscription failed for channel', config.PATH_CHANNEL, error);
    });

    // Return the cleanup function which stops the rerender.
    return () => {
      mbot.unsubscribe(config.PATH_CHANNEL).catch((err) => console.warn(err));
    }
  }, [particleDisplay]);

  // Effect to request the SLAM map.
  useEffect(() => {
    let timerId = null;

    async function requestSLAMMap() {
      try {
        const data = await mbot.readMap();
        const headerData = {
          width: data.width,
          height: data.height,
          metersPerCell: data.meters_per_cell,
          origin: data.origin
        };

        if (scene.current.loaded) {
          scene.current.setMapHeaderData(data.width, data.height, data.meters_per_cell, data.origin);
          scene.current.updateCells(data.cells);
        }

        return headerData;
      } catch (error) {
        console.warn("Error reading map:", error);
        return null;
      }
    }

    if (slamMode === config.slam_mode.FULL_SLAM){
      // Check for map once right away.
      requestSLAMMap();
      // Check for map intermittently.
      timerId = setInterval(() => { requestSLAMMap(); }, config.MAP_UPDATE_PERIOD);
    }
    else if (slamMode === config.slam_mode.LOCALIZATION_ONLY) {
      // Request the map only once if we are in localization mode.
      requestSLAMMap();
    }

    // Return the cleanup function which stops the rerender.
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [requestMap, slamMode]);

  return (
    <div id="canvas-container" ref={canvasWrapperRef}>
    </div>
  );
}

export default function MBotApp({ mbot }) {
  const [hostname, setHostname] = useState("mbot-???");
  const [connected, setConnected] = useState(false);
  // Toggle selectors.
  const [robotDisplay, setRobotDisplay] = useState(true);
  const [laserDisplay, setLaserDisplay] = useState(false);
  const [particleDisplay, setParticleDisplay] = useState(false);
  const [drivingMode, setDrivingMode] = useState(false);
  // Channels to subscribe to.
  const [poseAvailable, setPoseAvailable] = useState(false);
  const [laserAvailable, setLaserAvailable] = useState(false);
  const [mapAvailable, setMapAvailable] = useState(false);
  const [particlesAvailable, setParticlesAvailable] = useState(false);
  const [slamModeAvailable, setSlamModeAvailable] = useState(false);
  // Robot parameters.
  const [robotPose, setRobotPose] = useState({x: 0, y: 0, theta: 0});
  const [robotCell, setRobotCell] = useState([0, 0]);
  // Visualization elements.
  const [clickedCell, setClickedCell] = useState([]);
  // Mapping parameters.
  const [slamMode, setSlamMode] = useState(config.slam_mode.INVALID);
  const [requestMap, setRequestMap] = useState(false);

  // A heartbeat effect that checks if the MBot Bridge backend is connected and
  // updates which channels we care about are available.
  useEffect(() => {
    let timerId = null;

    const chMaps = [
      {state: poseAvailable, ch: config.POSE_CHANNEL, setter: setPoseAvailable},
      {state: laserAvailable, ch: config.LIDAR_CHANNEL, setter: setLaserAvailable},
      {state: mapAvailable, ch: config.SLAM_MAP_CHANNEL, setter: setMapAvailable},
      {state: particlesAvailable, ch: config.PARTICLE_CHANNEL, setter: setParticlesAvailable},
      {state: slamModeAvailable, ch: config.SLAM_MODE_CHANNEL, setter: setSlamModeAvailable},
    ]

    function checkChannels() {
      mbot.readChannels().then((chs) => {
        const chsList = chs.map((ch) => ch.channel);
        if (!connected) setConnected(true);
        // Check if any of the channels we are looking for have either appeared or disappeared.
        for (const ele of chMaps) {
          const hasData = chsList.includes(ele.ch);
          if (hasData != ele.state) ele.setter(hasData);
        }
      }).catch((err) => {
        if (connected) setConnected(false);
      });
    }

    // Check if connected once right away.
    checkChannels();

    // Check for connection intermittently.
    timerId = setInterval(() => { checkChannels(); }, config.CONNECT_PERIOD);

    // Return the cleanup function which stops the rerender.
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [connected, setConnected,
      poseAvailable, setPoseAvailable,
      laserAvailable, setLaserAvailable,
      mapAvailable, setMapAvailable,
      particlesAvailable, setParticlesAvailable,
      slamModeAvailable, setSlamModeAvailable]);

  // Effect to request the MBot hostname on first mounting component.
  useEffect(() => {
    // Read the hostname.
    if (connected) {
      mbot.readHostname().then((name) => {
        setHostname(name);
      }).catch((err) => {
        console.warn("Could not get hostname:", err);
      });
    }
  }, [connected, setHostname]);

  // Effect to manage SLAM mode.
  useEffect(() => {
    mbot.subscribe(config.SLAM_MODE_CHANNEL, (msg) => {
      const data = msg.data;
      // Only update if the mode has changed.
      if (data.slam_mode !== slamMode) {
        if (data.slam_mode !== config.slam_mode.FULL_SLAM) {
          // If we are not in mapping mode, stop asking for map.
          setRequestMap(false);
        }
        else {
          // If we are in mapping mode, start asking for map.
          setRequestMap(true);
        }
        setSlamMode(data.slam_mode);
      }
    }).then().catch((error) => {
      console.warn('Subscription failed for channel', config.SLAM_MODE_CHANNEL, error);
    });

    // Return the cleanup function which stops the subscription.
    return () => {
      mbot.unsubscribe(config.SLAM_MODE_CHANNEL).catch((err) => console.warn(err));
    }
  }, [slamMode, setSlamMode, setRequestMap]);

  // Callbacks.
  const onLocalizationMode = useCallback(() => {
    if (slamMode === config.slam_mode.IDLE) {
      // State is idle. Change to localization only.
      mbot.resetSLAM(config.slam_mode.LOCALIZATION_ONLY, false);
      // Make sure we are asking for the map. This will stop once we are in IDLE mode.
      setRequestMap(true);

      setSlamMode(config.slam_mode.LOCALIZATION_ONLY);
    }
    else {
      // We are in some other state. Turn back to idle.
      mbot.resetSLAM(config.slam_mode.IDLE);

      // Stop asking for map.
      setRequestMap(false);
      // this.stopRequestInterval();

      setSlamMode(config.slam_mode.IDLE);
    }
  }, [slamMode, setSlamMode, setRequestMap]);

  const onMappingMode = useCallback(() => {
    if (slamMode === config.slam_mode.FULL_SLAM) {
      // If we're in full slam, we need to reset the robot to localization only mode.
      mbot.resetSLAM(config.slam_mode.LOCALIZATION_ONLY, true);

      // Stop asking for map.
      setRequestMap(false);
      setSlamMode(config.slam_mode.LOCALIZATION_ONLY);
    }
    else if (slamMode === config.slam_mode.LOCALIZATION_ONLY) {
      // If we are not mapping, we need to tell the robot to start mapping.
      if (!confirm("This will overwrite the current map. Are you sure?")) return;

      mbot.resetSLAM(config.slam_mode.FULL_SLAM, false);

      // Start asking for map.
      setRequestMap(true);
      setSlamMode(config.slam_mode.FULL_SLAM);
    }
  }, [slamMode, setSlamMode, setRequestMap]);

  const onResetMap = useCallback(() => {
    if (slamMode === config.slam_mode.FULL_SLAM) {
      // Get user confirmation that the map should be cleared.
      if (!confirm("This will clear the current map. Are you sure?")) return;
      // Reset in full SLAM mode.
      mbot.resetSLAM(config.slam_mode.FULL_SLAM, false);
    }
  }, [slamMode]);

  const saveMap = useCallback(() => {

  }, []);

  return (
    <div id="wrapper">
      <div id="main">
        <MBotSceneWrapper mbot={mbot} connected={connected} requestMap={requestMap}
                          robotDisplay={robotDisplay}
                          laserDisplay={laserDisplay}
                          particleDisplay={particleDisplay}
                          slamMode={slamMode}
                          setSlamMode={setSlamMode}
                          setClickedCell={setClickedCell}
                          setRobotPose={setRobotPose}
                          setRobotCell={setRobotCell} />
      </div>

      <div id="sidenav">
        <div id="toggle-nav" onClick={() => {}}><FontAwesomeIcon icon={faBars} /></div>
        <div className="inner">
          <div className="title">
            {hostname.toUpperCase()}
          </div>

          <div className="status-wrapper">
            <ConnectionStatus status={connected}/>
            <StatusMessage robotCell={robotCell} robotPose={robotPose}
                           clickedCell={clickedCell} />
          </div>

          <div className="row">
            {/* Only show the SLAM control panel if we have received a SLAM status message. */}
            {slamModeAvailable &&
                <SLAMControlPanel slamMode={slamMode}
                                  onLocalizationMode={() => onLocalizationMode()}
                                  onMappingMode={() => onMappingMode()}
                                  onResetMap={() => onResetMap()}
                                  saveMap={() => saveMap()} />
              }

              { /* Checkboxes for map visualization. */}
              <ToggleSelect label={"Draw Robot"} checked={robotDisplay}
                            explain={"Displays the robot on the map."}
                            onChange={ () => { setRobotDisplay(!robotDisplay); } }/>

              <ToggleSelect label={"Draw Particles"} checked={particleDisplay} isActive={particlesAvailable}
                            explain={"Shows all the positions the robot thinks it might be at."}
                            onChange={ () => { setParticleDisplay(!particleDisplay); } }/>

              <ToggleSelect label={"Draw Lasers"} checked={laserDisplay} isActive={laserAvailable}
                            explain={"Displays the Lidar rays."}
                            onChange={ () => { setLaserDisplay(!laserDisplay); } }/>

              { /* Drive mode and control panel. */}
              <ToggleSelect label={"Drive Mode"} checked={drivingMode}
                            explain={"To drive the robot with your keyboard, use A,D for left & right, " +
                                      "W,S for forward & backward, and Q,E to rotate. " +
                                      "Or, use the joystick and turn buttons in the drive panel."}
                            onChange={ () => { setDrivingMode(!drivingMode); } }/>
              {drivingMode &&
                <DriveControlPanel mbot={mbot} drivingMode={drivingMode} />
              }
          </div>
        </div>
      </div>
    </div>
  );
}
