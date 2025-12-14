"use client"

import { Button } from "@/components/ui/button"
import { useState } from "react";
import { Plus } from "lucide-react";
import { AddTransactionDialog } from "@/components/add-transaction-dialog";

export default function Transactions() {
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false);

  return (
    <div className="w-full p-6">
        <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Transactions</h1>
            <Button 
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setIsAddTransactionOpen(true)}
            >
            <Plus className="w-4 h-4" /> New Transaction
            </Button>
        </div>

        <AddTransactionDialog
          open={isAddTransactionOpen}
          onOpenChange={setIsAddTransactionOpen}
        />
    </div>
  )
}