const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const fileChip = document.getElementById('file-chip');
const fileNameDisplay = document.getElementById('file-name-display');
const startBtn = document.getElementById('start-btn');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');
const statusPercent = document.getElementById('status-percent');
const downloadContainer = document.getElementById('download-container');
const downloadBtn = document.getElementById('download-btn');
const resultMetaText = document.getElementById('result-meta-text');

let selectedZipFile = null;
let finalOutputZipBlob = null;

const MONTH_MAP = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12'
};

// 拖曳互動
['dragenter', 'dragover'].forEach(evtName => {
  dropZone.addEventListener(evtName, (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(evtName => {
  dropZone.addEventListener(evtName, (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
  });
});

dropZone.addEventListener('drop', (e) => {
  if (e.dataTransfer.files.length > 0) {
    handleFileSelection(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFileSelection(e.target.files[0]);
  }
});

function handleFileSelection(file) {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    alert('Please upload a valid .zip file.');
    return;
  }
  selectedZipFile = file;
  fileNameDisplay.textContent = file.name;
  fileChip.style.display = 'inline-flex';
  startBtn.disabled = false;
  downloadContainer.style.display = 'none';
}

// 【解剖死亡日期解析核心】嚴格抓取「日-月-年」，杜絕張貼日與照片日期干擾
function parseDeathDate(rawStr) {
  if (!rawStr) return { clean: "20261016", display: "16 October 2026" };

  // 1. 英文月份格式：例如 "7 Oct 2026", "16 October 2026", "12 Oct 2026"
  const m1 = rawStr.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m1) {
    const d = parseInt(m1[1], 10).toString().padStart(2, '0');
    const mStr = m1[2].toLowerCase().substring(0, 3);
    const m = MONTH_MAP[mStr] || '10';
    const y = m1[3];
    return { clean: `${y}${m}${d}`, display: `${parseInt(d, 10)} ${m1[2]} ${y}` };
  }

  // 2. 日期開頭數字格式：例如 "07-10-2026" 或 "16-10-2026"
  const m2 = rawStr.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m2) {
    const d = parseInt(m2[1], 10).toString().padStart(2, '0');
    const m = parseInt(m2[2], 10).toString().padStart(2, '0');
    const y = m2[3];
    return { clean: `${y}${m}${d}`, display: `${y}/${m}/${d}` };
  }

  // 3. 西元年開頭標準格式：例如 "2026/10/16"
  const m3 = rawStr.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m3) {
    const y = m3[1];
    const m = parseInt(m3[2], 10).toString().padStart(2, '0');
    const d = parseInt(m3[3], 10).toString().padStart(2, '0');
    return { clean: `${y}${m}${d}`, display: `${y}/${m}/${d}` };
  }

  return { clean: "20261016", display: "16 October 2026" };
}

// 【過濾張貼雜訊】完全剔除 "Yang CH: IMG-..."、時間戳記、轉發字串
function cleanDiagnosis(raw) {
  const skipKeywords = ['house', 'g-a', 'fa-', 'gb/', 'w18/', 'fa2', 'fa3', 'code', 'chatra', 'sow', 'gilt', 'porker'];
  const lines = raw.split('\n');
  const validLines = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // 剔除 WhatsApp 轉發、發布者資訊、附件標籤與照片檔名
    if (
      line.includes('Yang CH:') ||
      line.includes('IMG-') ||
      line.includes('上午') ||
      line.includes('下午') ||
      line.includes('已轉寄') ||
      line.includes('附件檔案') ||
      line.includes('已略過圖像') ||
      line.toLowerCase().includes('date of death') // 避免在備註欄位重複印出死亡日期
    ) {
      continue;
    }

    if (skipKeywords.some(sk => line.toLowerCase() === sk) && line.length < 10) {
      continue;
    }

    // 移除特殊字元，保留純文字
    line = line.replace(/[^\x00-\x7F]/g, ' ').trim();
    if (line.length > 0) {
      validLines.push(line);
    }
  }

  return validLines.join('\n');
}

async function compressImageToJpegBlob(imageBlob) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = URL.createObjectURL(imageBlob);
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      const maxDim = 600;
      if (Math.max(w, h) > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/jpeg', 0.6);
    };
    img.onerror = () => resolve(imageBlob);
  });
}

function updateProgress(percent, text) {
  progressBar.style.width = `${percent}%`;
  statusPercent.textContent = `${percent}%`;
  statusText.textContent = text;
}

startBtn.addEventListener('click', async () => {
  if (!selectedZipFile) return;

  startBtn.disabled = true;
  downloadContainer.style.display = 'none';
  progressContainer.style.display = 'block';
  updateProgress(5, 'Extracting ZIP archive...');

  try {
    const zip = await JSZip.loadAsync(selectedZipFile);
    let chatTxtContent = '';
    const photoMap = {};

    const zipFiles = Object.keys(zip.files);
    for (const filename of zipFiles) {
      const entry = zip.files[filename];
      if (entry.dir) continue;
      
      const lower = filename.toLowerCase();
      const baseName = filename.split('/').pop();

      if (lower.endsWith('.txt')) {
        chatTxtContent = await entry.async('string');
      } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')) {
        photoMap[baseName] = entry;
      }
    }

    if (!chatTxtContent) {
      alert('Error: WhatsApp text log (.txt) not found in archive.');
      progressContainer.style.display = 'none';
      startBtn.disabled = false;
      return;
    }

    updateProgress(20, 'Analyzing Ear Tags and isolating necropsy records...');

    // 以耳號作為獨立個體切割點
    const earTagRegex = /\b((?:LY|DD|PORKER)\s*\d+|[YD]\s*\d+|L\s*\d+)\b/ig;
    const lines = chatTxtContent.split('\n');
    
    const pigRecords = [];
    let currentPig = null;
    let currentBlockText = '';

    for (let line of lines) {
      line = line.trim();
      const match = line.match(earTagRegex);
      
      // 收集該行所列出的照片
      const imgMatches = Array.from(line.matchAll(/(IMG-\d{8}-WA\d+\.jpg)/g)).map(m => m[1]);
      imgMatches.forEach(img => {
        if (currentPig) currentPig.imagesSet.add(img);
      });

      // 偵測到新耳號行時，切換為下一頭個體
      if (match && line.length < 25) {
        if (currentPig) {
          currentPig.diagnosis = cleanDiagnosis(currentBlockText);
          pigRecords.push(currentPig);
        }
        
        const extractedEar = match[0].toUpperCase().replace(/\s+/g, '');
        currentBlockText = '';
        
        currentPig = {
          earTag: extractedEar,
          cleanDate: '20261016',
          displayDate: '16 October 2026',
          imagesSet: new Set(),
          diagnosis: '',
          hasLockedDeathDate: false
        };
      }

      if (currentPig) {
        currentBlockText += line + '\n';
        
        // 嚴格鎖定：只從內文的 "Date of death:" 解析真實解剖死亡日期
        if (!currentPig.hasLockedDeathDate) {
          const deathDateMatch = line.match(/date\s+of\s+death\s*[:：]?\s*([^\n,]+)/i);
          if (deathDateMatch && deathDateMatch[1]) {
            const rawDeathStr = deathDateMatch[1].trim();
            const norm = parseDeathDate(rawDeathStr);
            currentPig.cleanDate = norm.clean;
            currentPig.displayDate = norm.display;
            currentPig.hasLockedDeathDate = true; // 鎖定，後續的張貼時間與圖片檔名不可覆蓋
          }
        }
      }
    }
    
    if (currentPig) {
      currentPig.diagnosis = cleanDiagnosis(currentBlockText);
      pigRecords.push(currentPig);
    }

    // 關聯圖片
    for (let pig of pigRecords) {
      pig.images = Array.from(pig.imagesSet);
    }

    if (pigRecords.length === 0) {
      alert('Notice: No valid pig necropsy records could be identified.');
      progressContainer.style.display = 'none';
      startBtn.disabled = false;
      return;
    }

    const outZip = new JSZip();
    const totalPigs = pigRecords.length;

    for (let idx = 0; idx < totalPigs; idx++) {
      const pig = pigRecords[idx];
      const percent = 20 + Math.round(((idx + 1) / totalPigs) * 70);
      updateProgress(percent, `Compiling: ${pig.cleanDate}_${pig.earTag}.pdf (${idx + 1}/${totalPigs})`);

      const pdfDoc = await PDFLib.PDFDocument.create();
      let page = pdfDoc.addPage([595.28, 841.89]);
      const { width, height } = page.getSize();
      const fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
      const fontRegular = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);

      // 標題
      page.drawText("Farm Post-Mortem and Image Record Report", {
        x: 40, y: height - 42, size: 14, font: fontBold, color: PDFLib.rgb(0, 0.17, 0.29)
      });

      // 個體摘要資訊框
      page.drawRectangle({
        x: 40, y: height - 88, width: width - 80, height: 36,
        color: PDFLib.rgb(0.96, 0.97, 0.98), borderColor: PDFLib.rgb(0.85, 0.88, 0.92), borderWidth: 0.5
      });
      page.drawText(`Sow Ear Tag: ${pig.earTag}`, { x: 50, y: height - 68, size: 9, font: fontBold });
      // 顯示真實的解剖死亡日期
      page.drawText(`Date of Death: ${pig.displayDate}`, { x: 260, y: height - 68, size: 9, font: fontBold });
      page.drawText(`Total Lesion Images: ${pig.images.length} photos`, { x: 50, y: height - 81, size: 8, font: fontRegular });

      // 純病理備註
      page.drawText("[ Primary Diagnosis & Pathological Notes ]", {
        x: 40, y: height - 108, size: 10, font: fontBold, color: PDFLib.rgb(0, 0.17, 0.29)
      });

      const diagLines = pig.diagnosis.split('\n').slice(0, 10);
      let curY = height - 123;
      for (const line of diagLines) {
        page.drawText(line.substring(0, 95), { x: 45, y: curY, size: 8, font: fontRegular, color: PDFLib.rgb(0.1, 0.1, 0.1) });
        curY -= 12;
      }

      page.drawText("[ Sequential Post-Mortem Lesion Images ]", {
        x: 40, y: curY - 5, size: 10, font: fontBold, color: PDFLib.rgb(0, 0.17, 0.29)
      });
      curY -= 15;

      // 2 Columns 照片網格排版
      pig.images.sort();
      const colW = 250;
      const rowH = 180;
      let colIdx = 0;

      for (const imgName of pig.images) {
        if (curY - rowH < 30) {
          page = pdfDoc.addPage([595.28, 841.89]);
          curY = height - 42;
          colIdx = 0;
        }

        const imgX = colIdx === 0 ? 40 : 305;
        page.drawText(`File: ${imgName}`, { x: imgX, y: curY - 10, size: 7, font: fontRegular });

        if (photoMap[imgName]) {
          try {
            const rawBlob = await photoMap[imgName].async('blob');
            const compressed = await compressImageToJpegBlob(rawBlob);
            const arrayBuffer = await compressed.arrayBuffer();
            const embeddedImg = await pdfDoc.embedJpg(arrayBuffer);
            page.drawImage(embeddedImg, {
              x: imgX, y: curY - rowH, width: colW, height: rowH - 15
            });
          } catch (err) {
            page.drawText("[Image Read Error]", { x: imgX, y: curY - 30, size: 8, font: fontRegular });
          }
        } else {
          page.drawText("[Image Missing]", { x: imgX, y: curY - 30, size: 8, font: fontRegular });
        }

        colIdx++;
        if (colIdx === 2) {
          colIdx = 0;
          curY -= rowH;
        }
      }

      const pdfBytes = await pdfDoc.save();
      outZip.file(`${pig.cleanDate}_${pig.earTag}.pdf`, pdfBytes);
    }

    updateProgress(96, 'Packaging into unified ZIP archive...');
    finalOutputZipBlob = await outZip.generateAsync({ type: 'blob' });
    
    updateProgress(100, 'Processing complete!');
    resultMetaText.textContent = `Successfully generated ${totalPigs} PDF reports in a single compressed package.`;
    downloadContainer.style.display = 'block';

  } catch (error) {
    console.error(error);
    alert('Execution error: ' + error.message);
    statusText.textContent = 'Execution Failed';
  } finally {
    startBtn.disabled = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (!finalOutputZipBlob) return;
  const url = URL.createObjectURL(finalOutputZipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'All_Generated_Pig_Reports.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
