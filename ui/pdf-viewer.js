// pdf-viewer.js

document.addEventListener("DOMContentLoaded", async () => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '../lib/pdf.worker.min.js';

    const query = new URLSearchParams(location.search);
    const pdfUrl = query.get("url");

    const contentDiv = document.getElementById("content");

    if (!pdfUrl) {
        contentDiv.innerHTML = "<p>No PDF URL provided.</p>";
        return;
    }

    try {
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        
        let fullText = "";

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            let lastY = -1;
            let pageText = "";

            for (const item of textContent.items) {
                if (lastY !== item.transform[5] && pageText.length > 0) {
                    pageText += "\n";
                }
                pageText += item.str;
                lastY = item.transform[5];
            }
            
            fullText += `<div class="page-break"></div><p>${pageText.replace(/\\n/g, '<br>')}</p>`;
        }

        contentDiv.innerHTML = fullText;

    } catch (err) {
        console.error("Failed to load PDF:", err);
        contentDiv.innerHTML = `<p style="color:red">Failed to extract text from PDF: ${err.message}</p>`;
    }
});
