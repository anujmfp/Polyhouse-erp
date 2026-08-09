/**
 * Polyhouse ERP - Demo Data Generator
 * Dynamically generates a complete history of sowing, transplanting, and harvesting
 * relative to the current date so that the dashboard displays active, ready,
 * and historical states realistically.
 */

const DemoDataGenerator = (() => {
  // Helper to get a date offset by a certain number of days
  const getDateOffset = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  const generate = () => {
    const today = new Date();
    const state = {
      settings: {
        rows: 19,
        linesPerRow: 2,
        towersPerLine: 63,
        rows1to7Holders: 10,
        rows1to7PlantsPerHolder: 4,
        rows8to19Holders: 15,
        rows8to19PlantsPerHolder: 4,
        trayCapacity: 40,
        seedGerminationDays: 25,
        saplingGerminationDays: 9,
        transplantToShendaDays: 15,
        harvestIntervalDays: 25,
        totalHarvests: 3,
        defaultExpectedYieldPerPlant: 0.15, // in kg
        cropCatalog: ["Romaine Lettuce", "Butterhead Lettuce", "Spinach", "Basil", "Coriander"]
      },
      sowingLogs: [],
      transplantLogs: [],
      harvestLogs: [],
      clearLogs: []
    };

    const crops = state.settings.cropCatalog;

    // Helper to calculate capacity
    const getCapacity = (row) => {
      const towers = state.settings.towersPerLine; // 63
      const holders = row <= 7 ? state.settings.rows1to7Holders : state.settings.rows8to19Holders;
      const pph = row <= 7 ? state.settings.rows1to7PlantsPerHolder : state.settings.rows8to19PlantsPerHolder;
      return towers * holders * pph;
    };

    let sowingIdCounter = 1;
    let transplantIdCounter = 1;
    let harvestIdCounter = 1;

    // Batch 1: Seed sowed 100 days ago, transplanted 75 days ago (ready for Harvest 3 today)
    const sowDate1 = getDateOffset(-100);
    const readyDate1 = getDateOffset(-75);
    state.sowingLogs.push({
      id: "SOW-" + sowingIdCounter++,
      crop: crops[0], // Romaine Lettuce
      type: "seed",
      trayCount: 150, // 150 * 40 = 6000 plants capacity
      sowDate: sowDate1,
      readyDate: readyDate1,
      status: "transplanted"
    });

    // Batch 2: Sapling sowed 80 days ago, transplanted 71 days ago
    const sowDate2 = getDateOffset(-80);
    const readyDate2 = getDateOffset(-71);
    state.sowingLogs.push({
      id: "SOW-" + sowingIdCounter++,
      crop: crops[1], // Butterhead Lettuce
      type: "sapling",
      trayCount: 100,
      sowDate: sowDate2,
      readyDate: readyDate2,
      status: "transplanted"
    });

    // Batch 3: Seed sowed 65 days ago, transplanted 40 days ago
    const sowDate3 = getDateOffset(-65);
    const readyDate3 = getDateOffset(-40);
    state.sowingLogs.push({
      id: "SOW-" + sowingIdCounter++,
      crop: crops[2], // Spinach
      type: "seed",
      trayCount: 120,
      sowDate: sowDate3,
      readyDate: readyDate3,
      status: "transplanted"
    });

    // Batch 4: Sapling sowed 20 days ago, transplanted 11 days ago
    const sowDate4 = getDateOffset(-20);
    const readyDate4 = getDateOffset(-11);
    state.sowingLogs.push({
      id: "SOW-" + sowingIdCounter++,
      crop: crops[3], // Basil
      type: "sapling",
      trayCount: 80,
      sowDate: sowDate4,
      readyDate: readyDate4,
      status: "transplanted"
    });

    // Batch 5: Seed sowed 25 days ago, ready today for transplant!
    const sowDate5 = getDateOffset(-25);
    const readyDate5 = getDateOffset(0);
    state.sowingLogs.push({
      id: "SOW-" + sowingIdCounter++,
      crop: crops[4], // Coriander
      type: "seed",
      trayCount: 95,
      sowDate: sowDate5,
      readyDate: readyDate5,
      status: "ready"
    });

    // Batch 6: Sapling sowed 5 days ago, ready in 4 days
    const sowDate6 = getDateOffset(-5);
    const readyDate6 = getDateOffset(4);
    state.sowingLogs.push({
      id: "SOW-" + sowingIdCounter++,
      crop: crops[0],
      type: "sapling",
      trayCount: 110,
      sowDate: sowDate6,
      readyDate: readyDate6,
      status: "germinating"
    });

    // Transplant Row 1 Line A (Active, finished Harvest 1 & 2, ready for Harvest 3 today)
    const t1 = {
      id: "TX-" + transplantIdCounter++,
      date: getDateOffset(-75),
      row: 1,
      line: "A",
      trayBatchId: "SOW-1",
      towersPlanted: 63,
      plantsPlanted: 2520,
      crop: crops[0],
      status: "active"
    };
    state.transplantLogs.push(t1);

    state.harvestLogs.push({
      id: "HRV-" + harvestIdCounter++,
      date: getDateOffset(-60),
      row: 1,
      line: "A",
      transplantLogId: t1.id,
      stage: "Shenda",
      yieldKg: 0,
      wasteKg: 2,
      crop: crops[0]
    });
    state.harvestLogs.push({
      id: "HRV-" + harvestIdCounter++,
      date: getDateOffset(-35),
      row: 1,
      line: "A",
      transplantLogId: t1.id,
      stage: "Harvest 1",
      yieldKg: 385,
      wasteKg: 12,
      crop: crops[0]
    });
    state.harvestLogs.push({
      id: "HRV-" + harvestIdCounter++,
      date: getDateOffset(-10),
      row: 1,
      line: "A",
      transplantLogId: t1.id,
      stage: "Harvest 2",
      yieldKg: 405,
      wasteKg: 15,
      crop: crops[0]
    });

    // Row 1 Line B: also transplanted 75 days ago from SOW-1
    const t2 = {
      id: "TX-" + transplantIdCounter++,
      date: getDateOffset(-75),
      row: 1,
      line: "B",
      trayBatchId: "SOW-1",
      towersPlanted: 63,
      plantsPlanted: 2520,
      crop: crops[0],
      status: "active"
    };
    state.transplantLogs.push(t2);
    state.harvestLogs.push({
      id: "HRV-" + harvestIdCounter++,
      date: getDateOffset(-60),
      row: 1,
      line: "B",
      transplantLogId: t2.id,
      stage: "Shenda",
      yieldKg: 0,
      wasteKg: 1,
      crop: crops[0]
    });
    state.harvestLogs.push({
      id: "HRV-" + harvestIdCounter++,
      date: getDateOffset(-35),
      row: 1,
      line: "B",
      transplantLogId: t2.id,
      stage: "Harvest 1",
      yieldKg: 390,
      wasteKg: 10,
      crop: crops[0]
    });
    state.harvestLogs.push({
      id: "HRV-" + harvestIdCounter++,
      date: getDateOffset(-10),
      row: 1,
      line: "B",
      transplantLogId: t2.id,
      stage: "Harvest 2",
      yieldKg: 412,
      wasteKg: 14,
      crop: crops[0]
    });

    // Row 8 Line A (capacity 3780 plants)
    const t3 = {
      id: "TX-" + transplantIdCounter++,
      date: getDateOffset(-71),
      row: 8,
      line: "A",
      trayBatchId: "SOW-2",
      towersPlanted: 63,
      plantsPlanted: 3780,
      crop: crops[1],
      status: "active"
    };
    state.transplantLogs.push(t3);
    state.harvestLogs.push({
      id: "HRV-" + harvestIdCounter++,
      date: getDateOffset(-56),
      row: 8,
      line: "A",
      transplantLogId: t3.id,
      stage: "Shenda",
      yieldKg: 0,
      wasteKg: 3,
      crop: crops[1]
    });
    state.harvestLogs.push({
      id: "HRV-" + harvestIdCounter++,
      date: getDateOffset(-31),
      row: 8,
      line: "A",
      transplantLogId: t3.id,
      stage: "Harvest 1",
      yieldKg: 565,
      wasteKg: 20,
      crop: crops[1]
    });
    state.harvestLogs.push({
      id: "HRV-" + harvestIdCounter++,
      date: getDateOffset(-6),
      row: 8,
      line: "A",
      transplantLogId: t3.id,
      stage: "Harvest 2",
      yieldKg: 590,
      wasteKg: 22,
      crop: crops[1]
    });

    // Row 12 Line A & B transplanted 40 days ago
    const t4 = {
      id: "TX-" + transplantIdCounter++,
      date: getDateOffset(-40),
      row: 12,
      line: "A",
      trayBatchId: "SOW-3",
      towersPlanted: 63,
      plantsPlanted: 3780,
      crop: crops[2],
      status: "active"
    };
    state.transplantLogs.push(t4);
    state.harvestLogs.push({
      id: "HRV-" + harvestIdCounter++,
      date: getDateOffset(-25),
      row: 12,
      line: "A",
      transplantLogId: t4.id,
      stage: "Shenda",
      yieldKg: 0,
      wasteKg: 2,
      crop: crops[2]
    });

    const t5 = {
      id: "TX-" + transplantIdCounter++,
      date: getDateOffset(-40),
      row: 12,
      line: "B",
      trayBatchId: "SOW-3",
      towersPlanted: 17,
      plantsPlanted: 1020,
      crop: crops[2],
      status: "active"
    };
    state.transplantLogs.push(t5);
    state.harvestLogs.push({
      id: "HRV-" + harvestIdCounter++,
      date: getDateOffset(-25),
      row: 12,
      line: "B",
      transplantLogId: t5.id,
      stage: "Shenda",
      yieldKg: 0,
      wasteKg: 0,
      crop: crops[2]
    });

    // Row 18 Line A sowed 11 days ago
    const t6 = {
      id: "TX-" + transplantIdCounter++,
      date: getDateOffset(-11),
      row: 18,
      line: "A",
      trayBatchId: "SOW-4",
      towersPlanted: 53,
      plantsPlanted: 3180,
      crop: crops[3],
      status: "active"
    };
    state.transplantLogs.push(t6);

    // Old cleared logs
    state.sowingLogs.push({
      id: "SOW-OLD1",
      crop: crops[4], // Coriander
      type: "seed",
      trayCount: 65,
      sowDate: getDateOffset(-150),
      readyDate: getDateOffset(-125),
      status: "transplanted"
    });
    const tOld = {
      id: "TX-OLD1",
      date: getDateOffset(-125),
      row: 4,
      line: "A",
      trayBatchId: "SOW-OLD1",
      towersPlanted: 63,
      plantsPlanted: 2520,
      crop: crops[4],
      status: "completed"
    };
    state.transplantLogs.push(tOld);
    state.harvestLogs.push({
      id: "HRV-OLD1-S",
      date: getDateOffset(-110),
      row: 4,
      line: "A",
      transplantLogId: tOld.id,
      stage: "Shenda",
      yieldKg: 0,
      wasteKg: 1,
      crop: crops[4]
    });
    state.harvestLogs.push({
      id: "HRV-OLD1-H1",
      date: getDateOffset(-85),
      row: 4,
      line: "A",
      transplantLogId: tOld.id,
      stage: "Harvest 1",
      yieldKg: 360,
      wasteKg: 15,
      crop: crops[4]
    });
    state.harvestLogs.push({
      id: "HRV-OLD1-H2",
      date: getDateOffset(-60),
      row: 4,
      line: "A",
      transplantLogId: tOld.id,
      stage: "Harvest 2",
      yieldKg: 395,
      wasteKg: 10,
      crop: crops[4]
    });
    state.harvestLogs.push({
      id: "HRV-OLD1-H3",
      date: getDateOffset(-35),
      row: 4,
      line: "A",
      transplantLogId: tOld.id,
      stage: "Harvest 3",
      yieldKg: 420,
      wasteKg: 8,
      crop: crops[4]
    });
    state.clearLogs.push({
      id: "CLR-OLD1",
      date: getDateOffset(-34),
      row: 4,
      line: "A",
      transplantLogId: tOld.id,
      reason: "Cycle completed (3 harvests done)"
    });

    return state;
  };

  return {
    generate
  };
})();
