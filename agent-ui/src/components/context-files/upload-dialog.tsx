import { type ChangeEvent, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatSize } from '@/lib/utils';

interface UploadContextDialogProps {
  busy: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (file: File) => void;
}

export function UploadContextDialog({ busy, open, onOpenChange, onUpload }: UploadContextDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] ?? null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload context file</DialogTitle>
          <DialogDescription className="sr-only">
            Upload a context file for NetX SRE Agent.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5">
          <input ref={inputRef} className="hidden" type="file" onChange={handleFileChange} />
          <div className="flex min-h-[78px] flex-col items-center justify-center rounded-lg border border-dashed border-[#485465] bg-[#121922]">
            <Button variant="outline" className="h-8 border-2 text-xs" onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Choose file
            </Button>
            <div className="mt-2 text-xs font-normal text-[#9fa8b7]">
              {selectedFile ? `${selectedFile.name} (${formatSize(selectedFile.size)})` : 'Maximum file size: 10 MB'}
            </div>
          </div>
          <div className="mt-2 text-xs font-normal text-[#a4adbb]">
            Supported formats: .txt, .csv, .json, .md, .html, .yaml, .yml
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" className="h-8 px-4 text-xs">
              Cancel
            </Button>
          </DialogClose>
          <Button className="h-8 px-5 text-xs" disabled={!selectedFile || busy} onClick={() => selectedFile && onUpload(selectedFile)}>
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
